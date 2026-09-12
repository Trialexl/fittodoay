from __future__ import annotations

import asyncio
from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from starlette.testclient import TestClient

from accounts.models import UserProfile
from mcp_gateway.api_proxy import (
    api_request,
    mint_delegated_jwt,
    validate_api_path,
    validate_query,
)
from mcp_gateway.combined import application as combined_application
from mcp_gateway.domain_tools import TrainingExercise, _upsert_workout_set
from mcp_gateway.models import OAuthClient, OAuthTokenRecord
from mcp_gateway.oauth_provider import DEFAULT_SCOPES, VALID_SCOPES, token_hash
from mcp_gateway.server import mcp
from mcp_gateway.services import create_training_program
from programs.models import DayTemplate, ProgramFolder, TemplateExercise
from workouts.models import Exercise_DB, WorkoutSetLog

User = get_user_model()


def test_api_allowlist_rejects_sensitive_and_unsafe_paths():
    assert validate_api_path("/api/programs/folders/1/") == "/api/programs/folders/1/"
    for path in (
        "https://evil.example/api/profile/",
        "/api/auth/login/",
        "/api/llm-agent/programs/",
        "/api/feedback/",
        "/admin/",
        "/api/workouts/music/tracks/",
        "/api/programs/%2e%2e/auth/",
        "/api/programs/../auth/",
        "/api/profile/?secret=x",
    ):
        with pytest.raises(ValueError):
            validate_api_path(path)
    with pytest.raises(ValueError):
        validate_query({"nested": {"secret": True}})


def test_tools_are_domain_specific_and_annotated():
    tools = asyncio.run(mcp.list_tools())
    names = {tool.name for tool in tools}
    required = {
        "get_profile",
        "search_exercises",
        "get_exercise",
        "list_programs",
        "get_workout_plan",
        "create_training_program",
        "log_workout_set",
        "upsert_weigh_in",
        "apply_workout_recommendations",
    }
    assert required.issubset(names)
    assert not {"api_request", "fittoday_get", "fittoday_post"} & names
    forbidden = {"path", "url", "method", "headers", "token", "user_id"}
    for tool in tools:
        assert not forbidden & set(tool.inputSchema.get("properties", {}))
        assert tool.annotations is not None
    by_name = {tool.name: tool for tool in tools}
    assert by_name["get_profile"].annotations.readOnlyHint is True
    assert by_name["delete_program"].annotations.destructiveHint is True
    assert by_name["create_program"].annotations.readOnlyHint is False


@pytest.mark.django_db(transaction=True)
def test_metadata_and_unauthorized_mcp_response():
    with TestClient(combined_application, base_url="http://localhost:8000") as client:
        metadata = client.get("/.well-known/oauth-authorization-server")
        assert metadata.status_code == 200
        assert "S256" in metadata.json()["code_challenge_methods_supported"]
        assert set(metadata.json()["scopes_supported"]) == VALID_SCOPES
        protected = client.get("/.well-known/oauth-protected-resource/mcp")
        assert protected.status_code == 200
        assert set(protected.json()["scopes_supported"]) == VALID_SCOPES
        default_registration = client.post(
            "/register",
            json={
                "redirect_uris": ["http://127.0.0.1:45677/callback"],
                "token_endpoint_auth_method": "none",
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "client_name": "Default scopes integration test",
            },
        )
        assert default_registration.status_code == 201
        assert set(default_registration.json()["scope"].split()) == VALID_SCOPES
        registration = client.post(
            "/register",
            json={
                "redirect_uris": ["http://127.0.0.1:45678/callback"],
                "token_endpoint_auth_method": "none",
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "scope": "fittoday.read fittoday.write",
                "client_name": "Codex integration test",
            },
        )
        assert registration.status_code == 201
        registered_client_id = registration.json()["client_id"]
        assert registered_client_id
        assert "client_secret" not in registration.json()
        response = client.post(
            "/mcp",
            headers={"accept": "application/json, text/event-stream"},
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "test", "version": "1"},
                },
            },
        )
        assert response.status_code == 401
        assert "resource_metadata=" in response.headers["WWW-Authenticate"]
        assert client.get("/api/profile/").status_code in {401, 403}

        user = User.objects.create_user(
            email="mcp-call@example.com", password="password-123"
        )
        raw_access = "integration-access-token"
        OAuthTokenRecord.objects.create(
            token_hash=token_hash(raw_access),
            token_family="integration-family",
            kind=OAuthTokenRecord.Kind.ACCESS,
            client=OAuthClient.objects.get(client_id=registered_client_id),
            user=user,
            scopes=["fittoday.read"],
            resource=settings.MCP_PUBLIC_URL,
            expires_at=timezone.now() + timedelta(minutes=5),
        )
        with patch(
            "mcp_gateway.domain_tools.api_request",
            new=AsyncMock(return_value={"goal": "strength"}),
        ):
            tool_call = client.post(
                "/mcp",
                headers={
                    "accept": "application/json, text/event-stream",
                    "authorization": f"Bearer {raw_access}",
                },
                json={
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/call",
                    "params": {"name": "get_profile", "arguments": {}},
                },
            )
        assert tool_call.status_code == 200
        assert "error" not in tool_call.json()

        raw_write_access = "integration-write-access-token"
        OAuthTokenRecord.objects.create(
            token_hash=token_hash(raw_write_access),
            token_family="integration-write-family",
            kind=OAuthTokenRecord.Kind.ACCESS,
            client=OAuthClient.objects.get(client_id=registered_client_id),
            user=user,
            scopes=list(DEFAULT_SCOPES),
            resource=settings.MCP_PUBLIC_URL,
            expires_at=timezone.now() + timedelta(minutes=5),
        )
        with patch(
            "mcp_gateway.domain_tools.api_request",
            new=AsyncMock(return_value={"id": 1, "name": "Scope test"}),
        ):
            write_tool_call = client.post(
                "/mcp",
                headers={
                    "accept": "application/json, text/event-stream",
                    "authorization": f"Bearer {raw_write_access}",
                },
                json={
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "tools/call",
                    "params": {
                        "name": "create_program",
                        "arguments": {"name": "Scope test"},
                    },
                },
            )
        assert write_tool_call.status_code == 200
        assert "error" not in write_tool_call.json()


def test_write_requires_write_scope_before_proxy_request():
    with pytest.raises(PermissionError):
        asyncio.run(
            api_request(
                user_id=1,
                client_id="client",
                scopes=["fittoday.read"],
                resource="http://localhost:8000/mcp",
                method="POST",
                path="/api/programs/folders/",
                payload={"name": "x"},
            )
        )


@pytest.mark.django_db
@override_settings(MCP_PUBLIC_URL="https://fit.example/mcp")
def test_delegated_jwt_enforces_resource_and_method_scope():
    user = User.objects.create_user(
        email="delegated@example.com", password="password-123"
    )
    UserProfile.objects.create(
        user=user,
        goal="strength",
        gender="other",
        age=30,
        weight_kg="75.00",
        height_cm="175.00",
        level="beginner",
        equipment="без оборудования",
    )
    client = APIClient()
    read_token = mint_delegated_jwt(
        user_id=user.id,
        client_id="codex",
        scopes=["fittoday.read"],
        resource="https://fit.example/mcp",
    )
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {read_token}")
    assert client.get("/api/profile/").status_code == 200
    assert (
        client.post(
            "/api/programs/folders/", {"name": "Forbidden"}, format="json"
        ).status_code
        == 403
    )
    wrong_resource = mint_delegated_jwt(
        user_id=user.id,
        client_id="codex",
        scopes=["fittoday.read"],
        resource="https://wrong.example/mcp",
    )
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {wrong_resource}")
    assert client.get("/api/profile/").status_code == 401


@pytest.mark.django_db
def test_atomic_program_creation_and_idempotency():
    user = User.objects.create_user(email="atomic@example.com", password="password-123")
    exercise = Exercise_DB.objects.create(
        id="mcp-squat",
        name_en="Squat",
        name_ru="Приседание",
        force_en="push",
        force_ru="жим",
        level_en="beginner",
        level_ru="начальный",
        equipment_en="body only",
        equipment_ru="без оборудования",
        category_en="strength",
        category_ru="силовая",
    )
    payload = {
        "name": "MCP программа",
        "days": [
            {
                "name": "День 1",
                "schedule_type": "weekly",
                "schedule_config": {"days_of_week": [1]},
                "template_exercises": [{"exercise_id": exercise.id}],
            }
        ],
    }
    first = create_training_program(
        user=user, payload=payload, idempotency_key="same-request"
    )
    second = create_training_program(
        user=user, payload=payload, idempotency_key="same-request"
    )
    assert first == second
    assert ProgramFolder.objects.filter(user=user, name="MCP программа").count() == 1

    with pytest.raises(Exception):
        create_training_program(
            user=user,
            idempotency_key="broken-request",
            payload={
                "name": "Не должна остаться",
                "days": [{"name": "", "schedule_type": "weekly"}],
            },
        )
    assert not ProgramFolder.objects.filter(
        user=user, name="Не должна остаться"
    ).exists()


@pytest.mark.django_db
def test_template_source_and_workout_log_upsert_are_exact():
    with pytest.raises(ValueError):
        TrainingExercise(exercise_id="one", custom_exercise_id=2)
    user = User.objects.create_user(email="logs@example.com", password="password-123")
    exercise = Exercise_DB.objects.create(
        id="mcp-row",
        name_en="Row",
        name_ru="Тяга",
        force_en="pull",
        force_ru="тяга",
        level_en="beginner",
        level_ru="начальный",
        equipment_en="barbell",
        equipment_ru="штанга",
        category_en="strength",
        category_ru="силовая",
    )
    folder = ProgramFolder.objects.get(user=user, name="Основные")
    day = DayTemplate.objects.create(
        folder=folder,
        name="Логи",
        schedule_type="weekly",
        schedule_config={"days_of_week": [1]},
    )
    item = TemplateExercise.objects.create(template=day, exercise=exercise)
    first = _upsert_workout_set(
        user_id=user.id,
        workout_date=__import__("datetime").date(2026, 7, 24),
        template_exercise_id=item.id,
        set_index=1,
        actual_reps=8,
        actual_weight="42.50",
        actual_time=90,
    )
    second = _upsert_workout_set(
        user_id=user.id,
        workout_date=__import__("datetime").date(2026, 7, 24),
        template_exercise_id=item.id,
        set_index=1,
        actual_reps=9,
        actual_weight="42.50",
        actual_time=90,
    )
    assert WorkoutSetLog.objects.count() == 1
    assert first["actual_weight"] == second["actual_weight"] == "42.50"
    assert second["actual_time"] == 90
