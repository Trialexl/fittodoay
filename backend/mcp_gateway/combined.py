from __future__ import annotations

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "fittodoey_backend.settings")

import django  # noqa: E402

django.setup()

from django.core.asgi import get_asgi_application  # noqa: E402

from .server import mcp_asgi  # noqa: E402

django_asgi = get_asgi_application()
MCP_PATHS = {
    "/authorize",
    "/token",
    "/register",
    "/revoke",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource/mcp",
}


async def application(scope, receive, send):
    if scope["type"] == "lifespan":
        await mcp_asgi(scope, receive, send)
        return
    path = scope.get("path", "")
    if path == "/mcp" or path.startswith("/mcp/") or path in MCP_PATHS:
        await mcp_asgi(scope, receive, send)
        return
    await django_asgi(scope, receive, send)
