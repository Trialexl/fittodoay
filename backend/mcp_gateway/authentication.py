from __future__ import annotations

from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication


class DelegatedJWTAuthentication(JWTAuthentication):
    """Accept only short-lived JWTs minted internally by the MCP gateway."""

    def authenticate(self, request):
        authenticated = super().authenticate(request)
        if authenticated is None:
            return None
        user, token = authenticated
        required_scope = (
            "fittoday.read"
            if request.method in {"GET", "HEAD", "OPTIONS"}
            else "fittoday.write"
        )
        if token.get("aud") != settings.MCP_PUBLIC_URL:
            raise exceptions.AuthenticationFailed("Некорректный delegated resource")
        if required_scope not in (token.get("scopes") or []):
            raise exceptions.PermissionDenied(
                f"Для операции требуется scope {required_scope}"
            )
        return user, token

    def get_user(self, validated_token):
        if not validated_token.get("mcp_delegated"):
            raise exceptions.AuthenticationFailed("Недопустимый delegated token")
        user = (
            get_user_model().objects.filter(pk=validated_token.get("user_id")).first()
        )
        if user is None or not user.is_active:
            raise exceptions.AuthenticationFailed("Пользователь недоступен")
        user.mcp_scopes = tuple(validated_token.get("scopes") or ())
        user.mcp_client_id = validated_token.get("mcp_client_id")
        user.mcp_resource = validated_token.get("aud")
        return user
