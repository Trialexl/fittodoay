from __future__ import annotations

from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.test import Client, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from mcp.server.auth.provider import AuthorizationParams, AuthorizeError
from mcp.shared.auth import OAuthClientInformationFull
from pydantic import AnyUrl

from mcp_gateway.models import (
    OAuthAuthorizationCode,
    OAuthTokenRecord,
)
from mcp_gateway.oauth_provider import (
    DjangoOAuthProvider,
    token_hash,
    validate_redirect_uri,
)

User = get_user_model()


def client_info(redirect="http://127.0.0.1:43123/callback"):
    return OAuthClientInformationFull(
        client_id="codex-test-client",
        redirect_uris=[redirect],
        token_endpoint_auth_method="none",
        scope="fittoday.read fittoday.write",
        client_name="Codex test",
    )


@pytest.mark.django_db(transaction=True)
@override_settings(
    MCP_PUBLIC_URL="https://fit.example/mcp", MCP_ISSUER_URL="https://fit.example"
)
def test_public_client_code_exchange_rotation_and_revocation():
    provider = DjangoOAuthProvider()
    info = client_info()
    async_to_sync(provider.register_client)(info)
    loaded = async_to_sync(provider.get_client)(info.client_id)
    assert loaded and loaded.client_secret is None
    with pytest.raises(AuthorizeError):
        async_to_sync(provider.authorize)(
            loaded,
            AuthorizationParams(
                state=None,
                scopes=["fittoday.read"],
                code_challenge="A" * 43,
                redirect_uri=AnyUrl("http://127.0.0.1:43123/callback"),
                redirect_uri_provided_explicitly=True,
                resource="https://wrong.example/mcp",
            ),
        )

    consent_url = async_to_sync(provider.authorize)(
        loaded,
        AuthorizationParams(
            state="state-1",
            scopes=["fittoday.read", "fittoday.write"],
            code_challenge="A" * 43,
            redirect_uri=AnyUrl("http://127.0.0.1:43123/callback"),
            redirect_uri_provided_explicitly=True,
            resource="https://fit.example/mcp",
        ),
    )
    raw_request = parse_qs(urlparse(consent_url).query)["request"][0]
    user = User.objects.create_user(email="oauth@example.com", password="password-123")
    browser = Client()
    assert browser.login(email=user.email, password="password-123")
    get_response = browser.get("/oauth/consent/", {"request": raw_request})
    assert get_response.status_code == 200
    response = browser.post(
        f"/oauth/consent/?request={raw_request}",
        {"request": raw_request, "decision": "approve"},
    )
    assert response.status_code == 302
    raw_code = parse_qs(urlparse(response["Location"]).query)["code"][0]
    assert not OAuthAuthorizationCode.objects.filter(code_hash=raw_code).exists()
    assert OAuthAuthorizationCode.objects.filter(
        code_hash=token_hash(raw_code)
    ).exists()

    other_info = client_info("http://localhost:43124/callback")
    other_info.client_id = "other-client"
    async_to_sync(provider.register_client)(other_info)
    other_client = async_to_sync(provider.get_client)(other_info.client_id)
    assert (
        async_to_sync(provider.load_authorization_code)(other_client, raw_code) is None
    )

    code = async_to_sync(provider.load_authorization_code)(loaded, raw_code)
    pair = async_to_sync(provider.exchange_authorization_code)(loaded, code)
    assert not OAuthTokenRecord.objects.filter(token_hash=pair.access_token).exists()
    access_row = OAuthTokenRecord.objects.get(token_hash=token_hash(pair.access_token))
    assert access_row.resource == "https://fit.example/mcp"
    assert async_to_sync(provider.load_authorization_code)(loaded, raw_code) is None

    refresh = async_to_sync(provider.load_refresh_token)(loaded, pair.refresh_token)
    rotated = async_to_sync(provider.exchange_refresh_token)(
        loaded, refresh, ["fittoday.read"]
    )
    assert rotated.refresh_token != pair.refresh_token
    assert (
        async_to_sync(provider.load_refresh_token)(loaded, pair.refresh_token) is None
    )
    access = async_to_sync(provider.load_access_token)(rotated.access_token)
    access_row = OAuthTokenRecord.objects.get(
        token_hash=token_hash(rotated.access_token)
    )
    access_row.expires_at = timezone.now() - timedelta(seconds=1)
    access_row.save(update_fields=["expires_at"])
    assert async_to_sync(provider.load_access_token)(rotated.access_token) is None
    access_row.expires_at = timezone.now() + timedelta(minutes=1)
    access_row.save(update_fields=["expires_at"])
    access = async_to_sync(provider.load_access_token)(rotated.access_token)
    async_to_sync(provider.revoke_token)(access)
    assert async_to_sync(provider.load_access_token)(rotated.access_token) is None


@pytest.mark.django_db
@override_settings(MCP_REDIRECT_ORIGINS=["https://codex.example"])
def test_redirect_allowlist_and_session_isolation():
    assert validate_redirect_uri("http://localhost:1234/callback")
    assert validate_redirect_uri("http://127.0.0.1:65535/callback")
    assert validate_redirect_uri("https://[::1]:9876/callback")
    assert validate_redirect_uri("https://codex.example/callback")
    assert not validate_redirect_uri("http://evil.example/callback")
    assert not validate_redirect_uri("https://evil.example/callback")
    assert not validate_redirect_uri("https://user:pass@codex.example/callback")
    assert not validate_redirect_uri("https://codex.example/callback#fragment")
    assert not validate_redirect_uri("https://codex.example/%2e%2e/admin")


@pytest.mark.django_db
def test_session_bootstrap_and_consent_csrf():
    user = User.objects.create_user(
        email="session@example.com", password="password-123"
    )
    token = Token.objects.create(user=user)
    client = Client(enforce_csrf_checks=True)
    response = client.post(
        "/api/auth/session-bootstrap/", HTTP_AUTHORIZATION=f"Token {token.key}"
    )
    assert response.status_code == 204
    assert int(client.session["_auth_user_id"]) == user.id


@pytest.mark.django_db(transaction=True)
@override_settings(
    MCP_PUBLIC_URL="https://fit.example/mcp",
    MCP_ISSUER_URL="https://fit.example",
)
def test_consent_requires_csrf_and_same_browser_user():
    provider = DjangoOAuthProvider()
    info = client_info()
    async_to_sync(provider.register_client)(info)
    loaded = async_to_sync(provider.get_client)(info.client_id)
    consent_url = async_to_sync(provider.authorize)(
        loaded,
        AuthorizationParams(
            state="state-2",
            scopes=["fittoday.read"],
            code_challenge="B" * 43,
            redirect_uri=AnyUrl("http://127.0.0.1:43123/callback"),
            redirect_uri_provided_explicitly=True,
            resource="https://fit.example/mcp",
        ),
    )
    raw_request = parse_qs(urlparse(consent_url).query)["request"][0]
    owner = User.objects.create_user(email="owner@example.com", password="password-123")
    other = User.objects.create_user(email="other@example.com", password="password-123")
    browser = Client(enforce_csrf_checks=True)
    assert browser.login(email=owner.email, password="password-123")
    page = browser.get("/oauth/consent/", {"request": raw_request})
    assert page.status_code == 200
    assert (
        browser.post(
            f"/oauth/consent/?request={raw_request}",
            {"request": raw_request, "decision": "approve"},
        ).status_code
        == 403
    )
    csrf = browser.cookies["csrftoken"].value
    browser.logout()
    assert browser.login(email=other.email, password="password-123")
    rejected = browser.post(
        f"/oauth/consent/?request={raw_request}",
        {"request": raw_request, "decision": "approve", "csrfmiddlewaretoken": csrf},
        HTTP_X_CSRFTOKEN=csrf,
    )
    assert rejected.status_code in {400, 403}
