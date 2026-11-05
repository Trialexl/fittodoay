import json
from datetime import timedelta
from types import SimpleNamespace
import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import UserProfile
from agents.models import LLMProgramDraft
from agents.services import (
    LLMProgramGenerationService,
    LLMInvalidResponse,
    OpenRouterClient,
)
from agents.tests import _create_base_program
from agents.tools import ProgramReadTools
from programs.models import ProgramFolder, DayTemplate

pytestmark = pytest.mark.django_db


@pytest.fixture
def plan_case():
    user = get_user_model().objects.create_user(
        email="draft@example.test", password="test"
    )
    UserProfile.objects.create(
        user=user,
        goal="strength",
        gender="male",
        age=30,
        weight_kg=80,
        height_cm=180,
        level="beginner",
        equipment="barbell",
    )
    folder, te = _create_base_program(user)
    plan = {
        "programs": [
            {
                "name": "Новый план",
                "days": [
                    {
                        "name": "День 1",
                        "schedule_type": "weekly",
                        "schedule_config": {"days_of_week": [0]},
                        "exercises": [
                            {
                                "exercise_id": te.exercise_id,
                                "sets": 3,
                                "reps": 8,
                                "weight": None,
                                "time": None,
                                "rest": 60,
                            }
                        ],
                    }
                ],
            }
        ]
    }
    return user, te, plan


def test_whole_plan_is_validated_before_writes(plan_case):
    user, te, plan = plan_case
    service = LLMProgramGenerationService(user)
    before = ProgramFolder.objects.count()
    invalids = []
    for change in (
        "unknown",
        "empty",
        "too_many_days",
        "too_many_programs",
        "invalid_number",
    ):
        candidate = json.loads(json.dumps(plan))
        entry = candidate["programs"][0]["days"][0]["exercises"][0]
        if change == "unknown":
            entry["exercise_id"] = "unknown"
        if change == "empty":
            candidate["programs"][0]["days"][0]["exercises"] = []
        if change == "too_many_days":
            candidate["programs"][0]["days"] *= 6
        if change == "too_many_programs":
            candidate["programs"] *= 2
        if change == "invalid_number":
            entry["sets"] = 100
        with pytest.raises(LLMInvalidResponse):
            service._persist_plan(candidate)
    assert ProgramFolder.objects.count() == before


def test_preview_reads_tools_but_creates_no_program_and_applies_once(
    plan_case, monkeypatch
):
    user, te, plan = plan_case

    def completion(_self, messages, tools, trace, **kwargs):
        tools.execute("get_exercise", {"exercise_id": te.exercise_id})
        return json.dumps(plan)

    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    monkeypatch.setattr(OpenRouterClient, "create_tool_completion", completion)
    service = LLMProgramGenerationService(user)
    before = ProgramFolder.objects.count()
    preview = service.generate({}, preview=True)
    assert ProgramFolder.objects.count() == before
    assert (
        preview["plan"]["programs"][0]["days"][0]["exercises"][0]["exercise_name"]
        == te.exercise.name
    )
    first = service.apply_draft(preview["draft_id"])
    second = service.apply_draft(preview["draft_id"])
    assert first == second
    assert ProgramFolder.objects.count() == before + 1


def test_draft_owner_expiration_and_profile_change(plan_case):
    user, te, plan = plan_case
    draft = LLMProgramDraft.objects.create(
        user=user,
        plan=plan,
        profile_snapshot=ProgramReadTools(user).execute("get_profile", {}),
    )
    other = get_user_model().objects.create_user(email="other-draft@example.test")
    with pytest.raises(LLMInvalidResponse, match="draft_not_found"):
        LLMProgramGenerationService(other).apply_draft(draft.pk)
    draft.expires_at = timezone.now() - timedelta(seconds=1)
    draft.save()
    with pytest.raises(LLMInvalidResponse, match="draft_expired"):
        LLMProgramGenerationService(user).apply_draft(draft.pk)
    draft.expires_at = timezone.now() + timedelta(days=1)
    draft.profile_snapshot = {"goal": "old"}
    draft.save()
    with pytest.raises(LLMInvalidResponse, match="draft_profile_changed"):
        LLMProgramGenerationService(user).apply_draft(draft.pk)


def test_preview_and_confirmation_api_contract(plan_case, monkeypatch):
    user, te, plan = plan_case

    def completion(_self, messages, tools, trace, **kwargs):
        tools.execute("get_exercise", {"exercise_id": te.exercise_id})
        return json.dumps(plan)

    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    monkeypatch.setattr(OpenRouterClient, "create_tool_completion", completion)
    client = APIClient()
    client.force_authenticate(user=user)
    response = client.post(
        "/api/llm-agent/programs/preview/", {"sessions_per_week": 1}, format="json"
    )
    assert response.status_code == 201
    endpoint = f"/api/llm-agent/programs/drafts/{response.data['draft_id']}/apply/"
    assert client.post(endpoint).status_code == 200
    assert client.post(endpoint).status_code == 200
    client.force_authenticate(user=None)
    assert client.post(endpoint).status_code in (401, 403)


def test_profile_edit_during_generation_invalidates_draft(plan_case, monkeypatch):
    user, te, plan = plan_case

    def completion(_self, messages, tools, trace, **kwargs):
        tools.execute("get_exercise", {"exercise_id": te.exercise_id})
        UserProfile.objects.filter(user=user).update(
            health_limitations="new limitation"
        )
        return json.dumps(plan)

    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    monkeypatch.setattr(OpenRouterClient, "create_tool_completion", completion)
    service = LLMProgramGenerationService(user)
    preview = service.generate({}, preview=True)
    with pytest.raises(LLMInvalidResponse, match="draft_profile_changed"):
        service.apply_draft(preview["draft_id"])
