from __future__ import annotations

from django.conf import settings
from django.db import models


class OAuthClient(models.Model):
    client_id = models.CharField(max_length=128, unique=True)
    redirect_uris = models.JSONField(default=list)
    scope = models.CharField(max_length=255)
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)


class OAuthAuthorizationRequest(models.Model):
    request_hash = models.CharField(max_length=64, unique=True)
    client = models.ForeignKey(OAuthClient, on_delete=models.CASCADE)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE
    )
    redirect_uri = models.TextField()
    redirect_uri_provided_explicitly = models.BooleanField(default=True)
    scopes = models.JSONField(default=list)
    state = models.TextField(null=True, blank=True)
    code_challenge = models.CharField(max_length=128)
    resource = models.TextField()
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class OAuthAuthorizationCode(models.Model):
    code_hash = models.CharField(max_length=64, unique=True)
    client = models.ForeignKey(OAuthClient, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    redirect_uri = models.TextField()
    redirect_uri_provided_explicitly = models.BooleanField(default=True)
    scopes = models.JSONField(default=list)
    code_challenge = models.CharField(max_length=128)
    resource = models.TextField()
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class OAuthTokenRecord(models.Model):
    class Kind(models.TextChoices):
        ACCESS = "access", "Access"
        REFRESH = "refresh", "Refresh"

    token_hash = models.CharField(max_length=64, unique=True)
    token_family = models.CharField(max_length=64, db_index=True)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    client = models.ForeignKey(OAuthClient, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    scopes = models.JSONField(default=list)
    resource = models.TextField()
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    replaced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["kind", "expires_at"]),
            models.Index(fields=["client", "user", "kind"]),
        ]


class MCPIdempotencyRecord(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    key = models.CharField(max_length=128)
    operation = models.CharField(max_length=64)
    response = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "operation", "key"],
                name="mcp_idempotency_user_operation_key",
            )
        ]
