from __future__ import annotations

import secrets
from datetime import timedelta
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import login
from django.http import HttpResponseBadRequest, HttpResponseRedirect
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_http_methods
from rest_framework import permissions
from rest_framework.authentication import TokenAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView

from mcp.server.auth.provider import construct_redirect_uri

from .models import OAuthAuthorizationCode, OAuthAuthorizationRequest
from .oauth_provider import token_hash


def _pending(raw_request: str):
    return (
        OAuthAuthorizationRequest.objects.select_related("client", "user")
        .filter(
            request_hash=token_hash(raw_request),
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .first()
    )


@require_http_methods(["GET", "POST"])
def consent(request):
    raw_request = request.GET.get("request") or request.POST.get("request") or ""
    pending = _pending(raw_request)
    if not pending:
        return HttpResponseBadRequest("Запрос авторизации истёк или недействителен")
    if not request.user.is_authenticated:
        return_to = f"/oauth/consent/?{urlencode({'request': raw_request})}"
        return HttpResponseRedirect(f"/?{urlencode({'return_to': return_to})}")
    if pending.user_id and pending.user_id != request.user.id:
        return HttpResponseBadRequest("Этот запрос принадлежит другому пользователю")
    if request.method == "GET":
        pending.user = request.user
        pending.save(update_fields=["user"])
        return render(
            request,
            "mcp_gateway/consent.html",
            {
                "oauth_request": raw_request,
                "client_name": pending.client.metadata.get("client_name") or "Codex",
                "scopes": pending.scopes,
            },
        )
    if request.POST.get("decision") != "approve":
        pending.consumed_at = timezone.now()
        pending.save(update_fields=["consumed_at"])
        return HttpResponseRedirect(
            construct_redirect_uri(
                pending.redirect_uri,
                error="access_denied",
                state=pending.state,
            )
        )
    if pending.user_id != request.user.id:
        return HttpResponseBadRequest("Сессия пользователя изменилась")
    raw_code = secrets.token_urlsafe(48)
    OAuthAuthorizationCode.objects.create(
        code_hash=token_hash(raw_code),
        client=pending.client,
        user=request.user,
        redirect_uri=pending.redirect_uri,
        redirect_uri_provided_explicitly=pending.redirect_uri_provided_explicitly,
        scopes=pending.scopes,
        code_challenge=pending.code_challenge,
        resource=pending.resource,
        expires_at=timezone.now() + timedelta(seconds=settings.MCP_AUTH_CODE_SECONDS),
    )
    pending.consumed_at = timezone.now()
    pending.save(update_fields=["consumed_at"])
    return HttpResponseRedirect(
        construct_redirect_uri(pending.redirect_uri, code=raw_code, state=pending.state)
    )


class SessionBootstrapView(APIView):
    authentication_classes = [TokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        login(
            request, request.user, backend="django.contrib.auth.backends.ModelBackend"
        )
        return Response(status=204)
