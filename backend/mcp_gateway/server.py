from __future__ import annotations

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
from .oauth_provider import READ_SCOPE, VALID_SCOPES, oauth_provider

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
            default_scopes=[READ_SCOPE],
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
mcp_asgi = mcp.streamable_http_app()
