from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from urllib.parse import urlparse

from asgiref.sync import sync_to_async
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    OAuthAuthorizationServerProvider,
    RefreshToken,
    RegistrationError,
    TokenError,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

from .models import (
    OAuthAuthorizationCode,
    OAuthAuthorizationRequest,
    OAuthClient,
    OAuthTokenRecord,
)

READ_SCOPE = "fittoday.read"
WRITE_SCOPE = "fittoday.write"
VALID_SCOPES = {READ_SCOPE, WRITE_SCOPE}
DEFAULT_SCOPES = (READ_SCOPE, WRITE_SCOPE)


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def validate_redirect_uri(uri: str) -> bool:
    if any(part in uri.lower() for part in ("%", "\\", "\r", "\n")):
        return False
    parsed = urlparse(uri)
    if parsed.username or parsed.password or parsed.fragment or not parsed.hostname:
        return False
    host = parsed.hostname.lower()
    if host in {"localhost", "127.0.0.1", "::1"}:
        return parsed.scheme in {"http", "https"} and parsed.path.startswith("/")
    if parsed.scheme != "https":
        return False
    origin = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    return origin in set(settings.MCP_REDIRECT_ORIGINS)


def _validate_resource(resource: str | None) -> str:
    if not resource or resource.rstrip("/") != settings.MCP_PUBLIC_URL:
        raise AuthorizeError("invalid_request", "Некорректный OAuth resource")
    return settings.MCP_PUBLIC_URL


def _scopes(value: list[str] | None) -> list[str]:
    result = list(dict.fromkeys(value or DEFAULT_SCOPES))
    if READ_SCOPE not in result or not set(result).issubset(VALID_SCOPES):
        raise AuthorizeError("invalid_scope", "Запрошены недопустимые scopes")
    return result


class DjangoOAuthProvider(
    OAuthAuthorizationServerProvider[AuthorizationCode, RefreshToken, AccessToken]
):
    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        row = await OAuthClient.objects.filter(client_id=client_id).afirst()
        if not row:
            return None
        return OAuthClientInformationFull.model_validate(row.metadata)

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        redirects = [str(uri) for uri in client_info.redirect_uris or []]
        if client_info.token_endpoint_auth_method not in {None, "none"}:
            raise RegistrationError(
                "invalid_client_metadata", "Поддерживаются только public clients"
            )
        if not redirects or not all(validate_redirect_uri(uri) for uri in redirects):
            raise RegistrationError("invalid_redirect_uri", "Redirect URI запрещён")
        requested = set((client_info.scope or " ".join(DEFAULT_SCOPES)).split())
        if READ_SCOPE not in requested or not requested.issubset(VALID_SCOPES):
            raise RegistrationError("invalid_client_metadata", "Некорректный scope")
        if not client_info.client_id:
            client_info.client_id = secrets.token_urlsafe(32)
        client_info.client_secret = None
        client_info.token_endpoint_auth_method = "none"
        metadata = client_info.model_dump(mode="json", exclude_none=True)
        await OAuthClient.objects.acreate(
            client_id=client_info.client_id,
            redirect_uris=redirects,
            scope=" ".join(sorted(requested)),
            metadata=metadata,
        )

    async def authorize(
        self, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> str:
        cleanup_before = timezone.now() - timedelta(days=7)
        await OAuthAuthorizationRequest.objects.filter(
            expires_at__lt=cleanup_before
        ).adelete()
        await OAuthAuthorizationCode.objects.filter(
            expires_at__lt=cleanup_before
        ).adelete()
        await OAuthTokenRecord.objects.filter(expires_at__lt=cleanup_before).adelete()
        if not params.code_challenge:
            raise AuthorizeError("invalid_request", "PKCE S256 обязателен")
        resource = _validate_resource(params.resource)
        registered_scopes = (client.scope or "").split()
        scopes = _scopes(params.scopes or registered_scopes)
        redirect_uri = str(params.redirect_uri)
        if not validate_redirect_uri(redirect_uri):
            raise AuthorizeError("invalid_request", "Redirect URI запрещён")
        raw_request = secrets.token_urlsafe(32)
        client_row = await OAuthClient.objects.aget(client_id=client.client_id)
        await OAuthAuthorizationRequest.objects.acreate(
            request_hash=token_hash(raw_request),
            client=client_row,
            redirect_uri=redirect_uri,
            redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
            scopes=scopes,
            state=params.state,
            code_challenge=params.code_challenge,
            resource=resource,
            expires_at=timezone.now()
            + timedelta(seconds=settings.MCP_AUTH_REQUEST_SECONDS),
        )
        return f"{settings.MCP_ISSUER_URL}/oauth/consent/?request={raw_request}"

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        row = (
            await OAuthAuthorizationCode.objects.select_related("client", "user")
            .filter(
                code_hash=token_hash(authorization_code),
                client__client_id=client.client_id,
                used_at__isnull=True,
                expires_at__gt=timezone.now(),
            )
            .afirst()
        )
        if not row:
            return None
        return AuthorizationCode(
            code=authorization_code,
            scopes=row.scopes,
            expires_at=row.expires_at.timestamp(),
            client_id=row.client.client_id,
            code_challenge=row.code_challenge,
            redirect_uri=row.redirect_uri,
            redirect_uri_provided_explicitly=row.redirect_uri_provided_explicitly,
            resource=row.resource,
            subject=str(row.user_id),
        )

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        return await sync_to_async(self._exchange_code_sync)(client, authorization_code)

    @staticmethod
    @transaction.atomic
    def _exchange_code_sync(
        client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        row = (
            OAuthAuthorizationCode.objects.select_for_update()
            .select_related("client", "user")
            .filter(
                code_hash=token_hash(authorization_code.code),
                client__client_id=client.client_id,
                used_at__isnull=True,
                expires_at__gt=timezone.now(),
                resource=settings.MCP_PUBLIC_URL,
            )
            .first()
        )
        if not row:
            raise TokenError("invalid_grant", "Authorization code недействителен")
        row.used_at = timezone.now()
        row.save(update_fields=["used_at"])
        return DjangoOAuthProvider._issue_pair(
            row.client, row.user_id, row.scopes, row.resource
        )

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> RefreshToken | None:
        row = (
            await OAuthTokenRecord.objects.filter(
                token_hash=token_hash(refresh_token),
                kind=OAuthTokenRecord.Kind.REFRESH,
                client__client_id=client.client_id,
                revoked_at__isnull=True,
                replaced_at__isnull=True,
                expires_at__gt=timezone.now(),
                resource=settings.MCP_PUBLIC_URL,
            )
            .select_related("client")
            .afirst()
        )
        if not row:
            return None
        return RefreshToken(
            token=refresh_token,
            client_id=row.client.client_id,
            scopes=row.scopes,
            expires_at=int(row.expires_at.timestamp()),
            subject=str(row.user_id),
        )

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: RefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        return await sync_to_async(self._exchange_refresh_sync)(
            client, refresh_token, scopes
        )

    @staticmethod
    @transaction.atomic
    def _exchange_refresh_sync(
        client: OAuthClientInformationFull,
        refresh_token: RefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        row = (
            OAuthTokenRecord.objects.select_for_update()
            .select_related("client")
            .filter(
                token_hash=token_hash(refresh_token.token),
                kind=OAuthTokenRecord.Kind.REFRESH,
                client__client_id=client.client_id,
                revoked_at__isnull=True,
                replaced_at__isnull=True,
                expires_at__gt=timezone.now(),
                resource=settings.MCP_PUBLIC_URL,
            )
            .first()
        )
        if not row or not set(scopes).issubset(set(row.scopes)):
            raise TokenError("invalid_grant", "Refresh token недействителен")
        row.replaced_at = timezone.now()
        row.save(update_fields=["replaced_at"])
        OAuthTokenRecord.objects.filter(
            token_family=row.token_family,
            kind=OAuthTokenRecord.Kind.ACCESS,
            revoked_at__isnull=True,
        ).update(revoked_at=timezone.now())
        return DjangoOAuthProvider._issue_pair(
            row.client,
            row.user_id,
            scopes or row.scopes,
            row.resource,
            family=row.token_family,
        )

    async def load_access_token(self, token: str) -> AccessToken | None:
        row = (
            await OAuthTokenRecord.objects.filter(
                token_hash=token_hash(token),
                kind=OAuthTokenRecord.Kind.ACCESS,
                revoked_at__isnull=True,
                expires_at__gt=timezone.now(),
                resource=settings.MCP_PUBLIC_URL,
            )
            .select_related("client")
            .afirst()
        )
        if not row:
            return None
        return AccessToken(
            token=token,
            client_id=row.client.client_id,
            scopes=row.scopes,
            expires_at=int(row.expires_at.timestamp()),
            resource=row.resource,
            subject=str(row.user_id),
        )

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        row = await OAuthTokenRecord.objects.filter(
            token_hash=token_hash(token.token)
        ).afirst()
        if row:
            await OAuthTokenRecord.objects.filter(
                token_family=row.token_family, revoked_at__isnull=True
            ).aupdate(revoked_at=timezone.now())

    @staticmethod
    def _issue_pair(
        client: OAuthClient,
        user_id: int,
        scopes: list[str],
        resource: str,
        *,
        family: str | None = None,
    ) -> OAuthToken:
        now = timezone.now()
        access_raw = secrets.token_urlsafe(48)
        refresh_raw = secrets.token_urlsafe(64)
        family = family or secrets.token_hex(32)
        OAuthTokenRecord.objects.bulk_create(
            [
                OAuthTokenRecord(
                    token_hash=token_hash(access_raw),
                    token_family=family,
                    kind=OAuthTokenRecord.Kind.ACCESS,
                    client=client,
                    user_id=user_id,
                    scopes=scopes,
                    resource=resource,
                    expires_at=now
                    + timedelta(seconds=settings.MCP_ACCESS_TOKEN_SECONDS),
                ),
                OAuthTokenRecord(
                    token_hash=token_hash(refresh_raw),
                    token_family=family,
                    kind=OAuthTokenRecord.Kind.REFRESH,
                    client=client,
                    user_id=user_id,
                    scopes=scopes,
                    resource=resource,
                    expires_at=now
                    + timedelta(seconds=settings.MCP_REFRESH_TOKEN_SECONDS),
                ),
            ]
        )
        return OAuthToken(
            access_token=access_raw,
            expires_in=settings.MCP_ACCESS_TOKEN_SECONDS,
            scope=" ".join(scopes),
            refresh_token=refresh_raw,
        )


oauth_provider = DjangoOAuthProvider()
