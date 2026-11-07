import json
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APIClient

from agents.models import LLMProgramThread, LLMProgramMessage, LLMRequestLog
from agents.services import LLMProgramChatService, OpenRouterClient, LLMInvalidResponse
from agents.tests import _create_base_program

pytestmark = pytest.mark.django_db


@pytest.fixture
def review(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test")
    user = get_user_model().objects.create_user(
        email="review-dialog@example.test", password="test"
    )
    folder, te = _create_base_program(user)
    te.exercise.name_ru = "Жим ногами"
    te.exercise.save()
    te.weight_override = 140
    te.save()
    thread = LLMProgramThread.objects.create(user=user, program=folder)
    service = LLMProgramChatService(thread)
    monkeypatch.setattr(
        LLMProgramChatService,
        "_build_post_workout_context",
        lambda *a, **k: {
            "validated_actions": [],
            "policy_decisions": [],
            "policy_rollout_mode": "shadow",
        },
    )
    return user, te, service


def test_legacy_analytics_followups_create_pending_keep_it_for_questions_and_apply_once(
    review, monkeypatch
):
    user, te, service = review
    monkeypatch.setattr(
        OpenRouterClient,
        "create_chat_completion",
        lambda *a, **k: json.dumps(
            {
                "assistant_reply": "Фактически выполнено 120, в плане 140.",
                "actions": [
                    {
                        "type": "update_weight",
                        "template_exercise_id": te.pk,
                        "weight": 120,
                    }
                ],
            }
        ),
    )
    contexts = []

    def completion(_self, messages, tools, trace, **kwargs):
        context = json.loads(messages[1]["content"])
        contexts.append(context)
        question = messages[-1]["content"]
        if "Давай" in question:
            return json.dumps(
                {
                    "assistant_reply": "Вес уже снижен до 120",
                    "actions": [
                        {
                            "type": "update_weight",
                            "template_exercise_id": te.pk,
                            "weight": 120,
                        }
                    ],
                }
            )
        assert context["proposal_state"]["pending"] is not None
        return json.dumps(
            {
                "assistant_reply": (
                    "Нажмите «Применить изменения»."
                    if "зафиксировать" in question
                    else "Диалог работает. Предложение ожидает подтверждения."
                ),
                "actions": [],
            }
        )

    monkeypatch.setattr(OpenRouterClient, "create_tool_completion", completion)
    with override_settings(WORKOUT_PROGRESSION_MODE="shadow"):
        initial = service.send("Разбери статистику", chat_mode="post_workout_review")
        assert initial.actions == []
        proposal = service.send(
            "Давай план сделаем 120", chat_mode="post_workout_review"
        )
        assert proposal.proposal_status == "pending"
        assert "140 → 120 кг" in proposal.content
        assert "План пока не изменён" in proposal.content
        assert "уже снижен" not in proposal.content
        te.refresh_from_db()
        assert te.weight_override == Decimal("140")
        how = service.send("А как зафиксировать?", chat_mode="post_workout_review")
        stuck = service.send("Сломался?", chat_mode="post_workout_review")
        assert how.content != stuck.content != proposal.content
        proposal.refresh_from_db()
        assert proposal.proposal_status == "pending"
        assert service._proposal_state()["pending"]["message_id"] == proposal.pk
        assert "progress_context" in contexts[-1]
        service.apply_actions(proposal.pk)
        te.refresh_from_db()
        assert te.weight_override == Decimal("120")
        assert service._proposal_state()["pending"] is None
        assert service._proposal_state()["last_change"]["status"] == "applied"
        with pytest.raises(LLMInvalidResponse):
            service.apply_actions(proposal.pk)
    log = LLMRequestLog.objects.filter(user=user).latest("id")
    assert log.response["requested_mode"] == "post_workout_review"
    assert log.response["effective_mode"] == "post_workout_chat"


def test_explicit_followup_api_accepts_manual_change_in_shadow(review, monkeypatch):
    user, te, service = review
    monkeypatch.setattr(
        OpenRouterClient,
        "create_tool_completion",
        lambda *a, **k: json.dumps(
            {
                "assistant_reply": "Готово",
                "actions": [
                    {
                        "type": "update_weight",
                        "template_exercise_id": te.pk,
                        "weight": 120,
                    }
                ],
            }
        ),
    )
    client = APIClient()
    client.force_authenticate(user=user)
    with override_settings(WORKOUT_PROGRESSION_MODE="shadow"):
        response = client.post(
            f"/api/llm-agent/threads/{service.thread.pk}/messages/",
            {
                "message": "Поставь в плане 120 кг",
                "mode": "post_workout_chat",
                "workout_date": "2026-11-06",
            },
            format="json",
        )
    assert response.status_code == 201
    proposal = response.data["assistant"]
    assert proposal["proposal_status"] == "pending"
    te.refresh_from_db()
    assert te.weight_override == 140
    assert (
        client.post(
            f"/api/llm-agent/threads/{service.thread.pk}/apply/",
            {"message_id": proposal["id"]},
            format="json",
        ).status_code
        == 200
    )
    te.refresh_from_db()
    assert te.weight_override == 120


def test_followup_preserves_pending_but_stale_program_is_still_rejected(
    review, monkeypatch
):
    user, te, service = review
    monkeypatch.setattr(
        service,
        "_call_llm",
        lambda _: json.dumps(
            {
                "assistant_reply": "Предлагаю",
                "actions": [
                    {
                        "type": "update_weight",
                        "template_exercise_id": te.pk,
                        "weight": 120,
                    }
                ],
            }
        ),
    )
    proposal = service.send("Сделай 120", chat_mode="post_workout_chat")
    te.note = "Ручное изменение"
    te.save()
    monkeypatch.setattr(
        service,
        "_call_llm",
        lambda _: '{"assistant_reply":"Проверьте предложение","actions":[]}',
    )
    service.send("Как сохранить?", chat_mode="post_workout_chat")
    with pytest.raises(LLMInvalidResponse, match="proposal_stale"):
        service.apply_actions(proposal.pk)


def test_followup_prompt_has_statistics_and_actual_action_state(review):
    user, te, service = review
    messages = service._build_messages(
        "Как сохранить?", mode="chat", chat_mode="post_workout_chat"
    )
    context = json.loads(messages[1]["content"])
    assert "progress_context" in context
    assert context["proposal_state"]["pending"] is None
    assert "последнее сообщение пользователя" in messages[0]["content"]
    assert "меньший фактический вес не означает" in messages[0]["content"]
    assert "такое решение сохраняет в плане 140 кг" in messages[0]["content"]
    assert "отсутствие повторов для них нормально" in messages[0]["content"]


def test_confirmation_commands_use_current_database_state_without_llm(
    review, monkeypatch
):
    user, te, service = review
    proposal = LLMProgramMessage.objects.create(
        thread=service.thread,
        role="assistant",
        actions=[
            {"type": "update_weight", "template_exercise_id": te.pk, "weight": 120}
        ],
        proposal_status="pending",
        content="План пока не изменён",
    )

    def no_model(*args, **kwargs):
        raise AssertionError("Confirmation state must not be generated by the model")

    monkeypatch.setattr(service, "_call_llm", no_model)
    pending = service.send("А как зафиксировать?", chat_mode="post_workout_chat")
    assert "ожидает подтверждения" in pending.content
    te.refresh_from_db()
    assert te.weight_override == 140
    service.apply_actions(proposal.pk)
    saved = service.send("Теперь в плане 120?", chat_mode="post_workout_chat")
    assert "«Применено»" in saved.content
    assert "вес 120 кг" in saved.content
    assert "нажмите" not in saved.content
    te.weight_override = 115
    te.save()
    changed = service.send("План изменён?", chat_mode="post_workout_chat")
    assert "вес 115 кг" in changed.content
    assert "вес 120 кг" not in changed.content
    assert service._confirmation_reply("Как сохранить темп движения при жиме?") is None
    log = LLMRequestLog.objects.filter(user=user).latest("id")
    assert log.response["reply_source"] == "proposal_state"
