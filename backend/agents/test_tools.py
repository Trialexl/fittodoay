import json
from unittest.mock import Mock
import pytest
import httpx
from django.contrib.auth import get_user_model
from agents.services import OpenRouterClient, LLMProgramChatService, LLMInvalidResponse
from agents.models import LLMProgramThread, LLMProgramMessage, LLMRequestLog
from agents.tools import ProgramReadTools
from agents.tests import _create_base_program
from programs.models import DayTemplate, TemplateExercise, ProgramFolder
from workouts.models import Exercise_DB

pytestmark = pytest.mark.django_db


def call(name, arguments, call_id="one"):
    return {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": call_id,
                "type": "function",
                "function": {"name": name, "arguments": json.dumps(arguments)},
            }
        ],
    }


@pytest.fixture
def chat(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    user = get_user_model().objects.create_user(
        email="tools@example.test", password="test"
    )
    folder, te = _create_base_program(user)
    thread = LLMProgramThread.objects.create(user=user, program=folder)
    return user, te, LLMProgramChatService(thread)


def test_real_http_contract_and_tool_result_roundtrip(chat, monkeypatch):
    user, te, service = chat
    wire = [
        call("search_exercises", {"query": "жим лежа"}),
        call("get_exercise", {"exercise_id": te.exercise_id}, "two"),
        {
            "role": "assistant",
            "content": json.dumps(
                {"assistant_reply": "Нашёл жим лежа.", "actions": []}
            ),
        },
    ]
    post = Mock(
        side_effect=[
            httpx.Response(
                200,
                json={"choices": [{"message": message}]},
                request=httpx.Request(
                    "POST", "https://openrouter.ai/api/v1/chat/completions"
                ),
            )
            for message in [*wire, wire[-1]]
        ]
    )
    monkeypatch.setattr("agents.services.httpx.post", post)
    before = TemplateExercise.objects.count()
    message = service.send("Найди жим лежа")
    assert message.actions == []
    assert TemplateExercise.objects.count() == before
    requests = [item.kwargs["json"] for item in post.call_args_list]
    assert requests[0]["tools"][0]["function"]["name"] == "search_exercises"
    assert "response_format" not in requests[0]
    assert requests[-1]["response_format"]["type"] == "json_schema"
    assert "tools" not in requests[-1]
    assert requests[1]["messages"][-1]["role"] == "tool"
    assert requests[1]["messages"][-1]["tool_call_id"] == "one"
    assert json.loads(requests[1]["messages"][-1]["content"])["total"] == 1
    trace = LLMRequestLog.objects.get(user=user).response["tool_trace"]
    assert [entry["name"] for entry in trace] == ["search_exercises", "get_exercise"]
    history = requests[0]["messages"]
    assert sum(item.get("content") == "Найди жим лежа" for item in history) == 1


def test_invalid_tool_arguments_are_returned_to_model_for_correction(chat, monkeypatch):
    user, te, service = chat
    replies = iter(
        [
            call("search_exercises", {"limit": 1000}),
            call("search_exercises", {"query": "жим"}),
            {"content": '{"assistant_reply":"Нашёл","actions":[]}'},
        ]
    )
    seen = []

    def request(_self, messages, **kwargs):
        seen.append(list(messages))
        try:
            request.last = next(replies)
        except StopIteration:
            pass
        return request.last

    monkeypatch.setattr(OpenRouterClient, "_request_message", request)
    service.send("Найди жим")
    assert json.loads(seen[1][-1]["content"])["error"] == "invalid_arguments"
    assert json.loads(seen[2][-1]["content"])["total"] == 1


def test_tool_budget_and_unknown_tools_do_not_mutate(chat, monkeypatch):
    user, te, service = chat
    monkeypatch.setattr(
        OpenRouterClient,
        "_request_message",
        lambda *a, **k: call("search_exercises", {"query": "жим"}),
    )
    with pytest.raises(LLMInvalidResponse, match="tool_call_limit"):
        service.send("поиск")
    log = LLMRequestLog.objects.get(user=user)
    assert len(log.response["tool_trace"]) == 3
    assert (
        ProgramReadTools(user).execute("delete_program", {})["error"] == "unknown_tool"
    )
    assert (
        ProgramReadTools(user, service._serialize_program).execute(
            "get_program", {"program_id": 777}
        )["error"]
        == "invalid_arguments"
    )
    assert TemplateExercise.objects.filter(pk=te.pk).exists()


def test_read_only_search_then_confirmation_and_stale_protection(chat, monkeypatch):
    user, te, service = chat
    replies = iter(
        [
            call("get_exercise", {"exercise_id": te.exercise_id}),
            {
                "content": json.dumps(
                    {
                        "assistant_reply": "Добавить жим?",
                        "actions": [
                            {
                                "type": "add_exercise",
                                "day_id": te.template_id,
                                "exercise_id": te.exercise_id,
                                "exercise_name": te.exercise.name,
                            }
                        ],
                    }
                )
            },
        ]
    )

    def request(*args, **kwargs):
        try:
            request.last = next(replies)
        except StopIteration:
            pass
        return request.last

    monkeypatch.setattr(OpenRouterClient, "_request_message", request)
    message = service.send("Добавь жим")
    assert message.proposal_status == "pending"
    assert TemplateExercise.objects.filter(template=te.template).count() == 1
    te.note = "edited manually"
    te.save()
    with pytest.raises(LLMInvalidResponse, match="proposal_stale"):
        service.apply_actions(message.pk)
    assert TemplateExercise.objects.filter(template=te.template).count() == 1


def test_failed_action_rolls_back_new_day_and_unknown_removal_is_rejected(chat):
    user, te, service = chat
    message = LLMProgramMessage.objects.create(
        thread=service.thread,
        role="assistant",
        content="test",
        proposal_status="pending",
        actions=[
            {
                "type": "add_exercise",
                "day_name": "среда",
                "exercise_id": "unknown-catalog-id",
            },
            {
                "type": "remove_exercise",
                "day_id": te.template_id,
                "exercise_name": "unknown-exercise",
            },
        ],
    )
    result = service.apply_actions(message.pk)
    assert all(item["status"] == "skipped" for item in result)
    assert DayTemplate.objects.filter(folder=service.thread.program).count() == 1
    te.refresh_from_db()
    assert te.is_active


def test_strict_numeric_validation_and_ambiguous_names(chat):
    user, te, service = chat
    for value in (-1, 9999, True, float("nan")):
        with pytest.raises(LLMInvalidResponse, match="invalid_action_fields"):
            service._validate_edit_action(
                {
                    "type": "update_weight",
                    "template_exercise_id": te.pk,
                    "weight": value,
                }
            )
    Exercise_DB.objects.create(
        id="duplicate-bench", name_ru=te.exercise.name, name_en="Duplicate"
    )
    assert service._resolve_exercise({"exercise_name": te.exercise.name}) is None
    assert (
        service._resolve_exercise(
            {"exercise_id": te.exercise_id, "exercise_name": "Другое упражнение"}
        )
        is None
    )


def test_no_unread_catalog_action_is_shown(chat, monkeypatch):
    user, te, service = chat
    monkeypatch.setattr(
        OpenRouterClient,
        "_request_message",
        lambda *a, **k: {
            "content": json.dumps(
                {
                    "assistant_reply": "Добавить?",
                    "actions": [
                        {
                            "type": "add_exercise",
                            "day_id": te.template_id,
                            "exercise_id": te.exercise_id,
                        }
                    ],
                }
            )
        },
    )
    message = service.send("Добавь упражнение")
    assert message.actions == []
    assert "не прошла проверку" in message.content
    assert LLMRequestLog.objects.get(user=user).response["action_validation_errors"]


def test_credit_reservation_retries_once_with_advertised_lower_budget(
    chat, monkeypatch
):
    monkeypatch.setenv("OPENROUTER_MAX_TOKENS", "4096")
    budgets = []

    def post(url, **kwargs):
        budgets.append(kwargs["json"]["max_tokens"])
        if len(budgets) == 1:
            return httpx.Response(
                402,
                json={"error": {"message": "can only afford 1000 tokens"}},
                request=httpx.Request("POST", url),
            )
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '{"assistant_reply":"Готово","actions":[]}'
                        }
                    }
                ]
            },
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr("agents.services.httpx.post", post)
    OpenRouterClient().create_chat_completion([{"role": "user", "content": "test"}])
    assert budgets == [4096, 936]


def test_proposal_uses_state_from_before_model_request(chat, monkeypatch):
    user, te, service = chat

    def completion(_self, messages, tools, trace, **kwargs):
        te.note = "manual edit while model was thinking"
        te.save()
        return json.dumps(
            {
                "assistant_reply": "Предлагаю 10 повторов",
                "actions": [
                    {"type": "update_weight", "template_exercise_id": te.pk, "reps": 10}
                ],
            }
        )

    monkeypatch.setattr(OpenRouterClient, "create_tool_completion", completion)
    proposal = service.send("Поставь 10 повторов")
    assert proposal.proposal_status == "pending"
    with pytest.raises(LLMInvalidResponse, match="proposal_stale"):
        service.apply_actions(proposal.pk)
    te.refresh_from_db()
    assert te.rep_override != 10


def test_foreign_or_missing_targets_never_become_pending(chat):
    user, te, service = chat
    other = get_user_model().objects.create_user(email="foreign-target@example.test")
    folder = ProgramFolder.objects.create(user=other, name="Чужая программа")
    day = DayTemplate.objects.create(folder=folder, name="Чужой день")
    foreign = TemplateExercise.objects.create(template=day, exercise=te.exercise)
    for action in (
        {"type": "remove_exercise", "template_exercise_id": foreign.pk},
        {
            "type": "replace_exercise",
            "template_exercise_id": foreign.pk,
            "exercise_id": te.exercise_id,
        },
        {
            "type": "add_exercise",
            "day_id": foreign.template_id,
            "day_name": te.template.name,
            "exercise_id": te.exercise_id,
        },
        {"type": "add_exercise", "exercise_id": te.exercise_id},
    ):
        assert service._normalize_actions_for_display([action]) == []
    result = service._validate_edit_action(
        {
            "type": "replace_exercise",
            "template_exercise_id": te.pk,
            "exercise_id": te.exercise_id,
        }
    )
    assert result["deactivate_exercise_id"] == te.pk


def test_catalog_id_remembered_from_history_is_reread_before_proposal(
    chat, monkeypatch
):
    user, te, service = chat
    candidate = {
        "role": "assistant",
        "content": json.dumps(
            {
                "assistant_reply": "Добавить жим",
                "actions": [
                    {
                        "type": "add_exercise",
                        "day_id": te.template_id,
                        "exercise_id": te.exercise_id,
                    }
                ],
            }
        ),
    }
    responses = iter(
        [
            candidate,
            call("get_exercise", {"exercise_id": te.exercise_id}),
            candidate,
            candidate,
        ]
    )
    requests = []

    def request(_self, messages, **kwargs):
        requests.append(list(messages))
        return next(responses)

    monkeypatch.setattr(OpenRouterClient, "_request_message", request)
    before = TemplateExercise.objects.count()
    proposal = service.send("Добавь упражнение из предыдущего ответа")
    assert proposal.proposal_status == "pending"
    assert TemplateExercise.objects.count() == before
    assert "exercise_not_read_by_tool" in requests[1][-1]["content"]
    assert json.loads(requests[2][-1]["content"])["id"] == te.exercise_id
