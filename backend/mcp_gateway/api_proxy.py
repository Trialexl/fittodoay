from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from urllib.parse import unquote, urlsplit

import httpx
from django.conf import settings
from rest_framework_simplejwt.tokens import AccessToken

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
ALLOWED_PREFIXES = (
    "/api/profile/",
    "/api/exercises/",
    "/api/programs/",
    "/api/workouts/",
    "/api/analytics/",
)
DENIED_PREFIXES = (
    "/api/auth/",
    "/api/llm-agent/",
    "/api/feedback/",
    "/admin/",
    "/api/workouts/music/",
)
MAX_RESPONSE_BYTES = 2 * 1024 * 1024


class DomainAPIError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 500, details: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


def validate_api_path(path: str) -> str:
    if not isinstance(path, str) or not path.startswith("/"):
        raise ValueError("Разрешён только относительный API path")
    parsed = urlsplit(path)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
        raise ValueError("URL, query и fragment внутри path запрещены")
    if "%" in path or unquote(path) != path or "\\" in path:
        raise ValueError("Encoded path запрещён")
    parts = [part for part in path.split("/") if part]
    if ".." in parts or "." in parts:
        raise ValueError("Traversal запрещён")
    if any(path.startswith(prefix) for prefix in DENIED_PREFIXES):
        raise ValueError("Endpoint запрещён для MCP")
    if not any(path.startswith(prefix) for prefix in ALLOWED_PREFIXES):
        raise ValueError("Endpoint не входит в MCP allowlist")
    return path


def validate_query(query: Mapping[str, Any] | None) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in (query or {}).items():
        if not isinstance(key, str) or not key or any(ch in key for ch in "\r\n"):
            raise ValueError("Некорректный query key")
        values = value if isinstance(value, list) else [value]
        if not all(
            isinstance(item, (str, int, bool)) or item is None for item in values
        ):
            raise ValueError("Query допускает только скалярные значения")
        result[key] = values if isinstance(value, list) else value
    return result


def mint_delegated_jwt(
    *, user_id: int, client_id: str, scopes: list[str], resource: str
) -> str:
    token = AccessToken()
    token["user_id"] = user_id
    token["mcp_delegated"] = True
    token["mcp_client_id"] = client_id
    token["scopes"] = scopes
    token["aud"] = resource
    return str(token)


async def api_request(
    *,
    user_id: int,
    client_id: str,
    scopes: list[str],
    resource: str,
    method: str,
    path: str,
    query: Mapping[str, Any] | None = None,
    payload: Mapping[str, Any] | None = None,
) -> Any:
    method = method.upper()
    path = validate_api_path(path)
    query = validate_query(query)
    required = "fittoday.read" if method in SAFE_METHODS else "fittoday.write"
    if required not in scopes:
        raise PermissionError(f"Для операции требуется scope {required}")
    token = mint_delegated_jwt(
        user_id=user_id, client_id=client_id, scopes=scopes, resource=resource
    )
    async with httpx.AsyncClient(
        base_url=settings.MCP_BACKEND_URL,
        timeout=httpx.Timeout(10.0),
        follow_redirects=False,
    ) as client:
        response = await client.request(
            method,
            path,
            params=query,
            json=dict(payload) if payload is not None else None,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
    if len(response.content) > MAX_RESPONSE_BYTES:
        raise DomainAPIError("Ответ внутреннего API слишком большой", status_code=502)
    if response.is_redirect:
        raise DomainAPIError("Внутренний redirect запрещён", status_code=502)
    try:
        data = response.json() if response.content else {}
    except ValueError:
        data = None
    if not 200 <= response.status_code < 300:
        message = "Операция Fittoday не выполнена"
        if isinstance(data, dict):
            message = str(data.get("detail") or data.get("message") or message)
        raise DomainAPIError(message, status_code=response.status_code, details=data)
    return data
