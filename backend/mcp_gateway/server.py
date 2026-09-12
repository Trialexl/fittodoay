from __future__ import annotations

import json
from urllib.parse import urlparse

from django.conf import settings
from mcp.server.auth.settings import (
    AuthSettings,
    ClientRegistrationOptions,
    RevocationOptions,
)
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from .domain_tools import register_domain_tools
from .oauth_provider import DEFAULT_SCOPES, READ_SCOPE, VALID_SCOPES, oauth_provider


class ProtectedResourceScopesMiddleware:
    """Publish supported OAuth scopes independently from required MCP scopes.

    MCP SDK 1.28 builds protected-resource metadata from ``required_scopes``.
    Fittoday deliberately requires only the read scope at the transport layer and
    enforces the write scope per mutating tool, so the SDK-generated metadata
    would otherwise hide the write capability from OAuth clients.
    """

    metadata_path = "/.well-known/oauth-protected-resource/mcp"

    def __init__(self, app, supported_scopes: list[str]):
        self.app = app
        self.supported_scopes = supported_scopes

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("path") != self.metadata_path:
            await self.app(scope, receive, send)
            return

        messages = []

        async def capture(message):
            messages.append(message)

        await self.app(scope, receive, capture)
        if not messages:
            return

        start = next(
            (
                message
                for message in messages
                if message["type"] == "http.response.start"
            ),
            None,
        )
        body_messages = [
            message for message in messages if message["type"] == "http.response.body"
        ]
        if start is None or start.get("status") != 200 or not body_messages:
            for message in messages:
                await send(message)
            return

        try:
            body = b"".join(message.get("body", b"") for message in body_messages)
            payload = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            for message in messages:
                await send(message)
            return

        payload["scopes_supported"] = self.supported_scopes
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers = [
            (name, value)
            for name, value in start.get("headers", [])
            if name.lower() != b"content-length"
        ]
        headers.append((b"content-length", str(len(body)).encode("ascii")))
        await send({**start, "headers": headers})
        await send({"type": "http.response.body", "body": body})


public_host = urlparse(settings.MCP_ISSUER_URL).netloc
public_origin = settings.MCP_ISSUER_URL

mcp = FastMCP(
    name="Fittoday",
    instructions="Предметные операции с упражнениями, программами, тренировками и аналитикой Fittoday.",
    auth_server_provider=oauth_provider,
    auth=AuthSettings(
        issuer_url=settings.MCP_ISSUER_URL,
        resource_server_url=settings.MCP_PUBLIC_URL,
        required_scopes=[READ_SCOPE],
        client_registration_options=ClientRegistrationOptions(
            enabled=True,
            valid_scopes=sorted(VALID_SCOPES),
            default_scopes=list(DEFAULT_SCOPES),
        ),
        revocation_options=RevocationOptions(enabled=True),
    ),
    streamable_http_path="/mcp",
    stateless_http=True,
    json_response=True,
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[
            public_host,
            "localhost:*",
            "127.0.0.1:*",
            "[::1]:*",
        ],
        allowed_origins=[
            public_origin,
            "http://localhost:*",
            "http://127.0.0.1:*",
            "http://[::1]:*",
        ],
    ),
)
register_domain_tools(mcp)
mcp_asgi = ProtectedResourceScopesMiddleware(
    mcp.streamable_http_app(),
    supported_scopes=sorted(VALID_SCOPES),
)
