from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from agents.models import LLMProgramMessage, LLMProgramThread, LLMRequestLog
from agents.services import LLMProgramChatService, LLMUnavailableError
from programs.models import DayTemplate, ProgramFolder, TemplateExercise
from workouts.models import Exercise_DB

User = get_user_model()


def _create_base_program(user):
    folder = ProgramFolder.objects.create(user=user, name="Силовая")
    template = DayTemplate.objects.create(
        folder=folder,
        name="День 1",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0]},
    )
    exercise = Exercise_DB.objects.create(
        id="agent_test_exercise",
        name_en="Bench Press",
        name_ru="Жим лежа",
        force_en="push",
        force_ru="",
        level_en="beginner",
        level_ru="начальный",
        mechanic_en="compound",
        mechanic_ru="",
        equipment_en="barbell",
        equipment_ru="штанга",
        category_en="strength",
        category_ru="Силовая",
        has_weight=True,
        default_weight=40,
        default_reps=8,
        default_sets=3,
    )
    te = TemplateExercise.objects.create(
        template=template,
        exercise=exercise,
        set_override=3,
        rep_override=8,
        weight_override=40,
    )
    return folder, te


@pytest.mark.django_db
def test_apply_actions_requires_message_id_and_updates_program():
    user = User.objects.create_user(email="agent_apply@example.com", password="pass")
    folder, te = _create_base_program(user)
    thread = LLMProgramThread.objects.create(user=user, program=folder, title="Чат")
    message = LLMProgramMessage.objects.create(
        thread=thread,
        role=LLMProgramMessage.Role.ASSISTANT,
        content="Предлагаю поднять вес",
        actions=[{"type": "update_weight", "template_exercise_id": te.id, "weight": 46}],
        proposal_status=LLMProgramMessage.ProposalStatus.PENDING,
    )

    client = APIClient()
    client.force_authenticate(user=user)
    response = client.post(
        f"/api/llm-agent/threads/{thread.id}/apply/",
        {"message_id": message.id},
        format="json",
    )

    assert response.status_code == 200
    te.refresh_from_db()
    message.refresh_from_db()
    assert float(te.weight_override) == 46.0
    assert message.proposal_status == LLMProgramMessage.ProposalStatus.APPLIED


@pytest.mark.django_db
def test_cancel_actions_marks_proposal_cancelled():
    user = User.objects.create_user(email="agent_cancel@example.com", password="pass")
    folder, te = _create_base_program(user)
    thread = LLMProgramThread.objects.create(user=user, program=folder, title="Чат")
    message = LLMProgramMessage.objects.create(
        thread=thread,
        role=LLMProgramMessage.Role.ASSISTANT,
        content="Можем заменить упражнение",
        actions=[
            {
                "type": "update_weight",
                "template_exercise_id": te.id,
                "weight": 42,
            }
        ],
        proposal_status=LLMProgramMessage.ProposalStatus.PENDING,
    )

    client = APIClient()
    client.force_authenticate(user=user)
    response = client.post(
        f"/api/llm-agent/threads/{thread.id}/cancel/",
        {"message_id": message.id},
        format="json",
    )

    assert response.status_code == 200
    message.refresh_from_db()
    te.refresh_from_db()
    assert message.proposal_status == LLMProgramMessage.ProposalStatus.CANCELLED
    assert float(te.weight_override) == 40.0


@pytest.mark.django_db
def test_apply_rejects_non_pending_proposal():
    user = User.objects.create_user(email="agent_reject@example.com", password="pass")
    folder, te = _create_base_program(user)
    thread = LLMProgramThread.objects.create(user=user, program=folder, title="Чат")
    message = LLMProgramMessage.objects.create(
        thread=thread,
        role=LLMProgramMessage.Role.ASSISTANT,
        content="Подтвердите правки",
        actions=[{"type": "update_weight", "template_exercise_id": te.id, "weight": 44}],
        proposal_status=LLMProgramMessage.ProposalStatus.CANCELLED,
    )

    client = APIClient()
    client.force_authenticate(user=user)
    response = client.post(
        f"/api/llm-agent/threads/{thread.id}/apply/",
        {"message_id": message.id},
        format="json",
    )

    assert response.status_code == 400
    te.refresh_from_db()
    assert float(te.weight_override) == 40.0


@pytest.mark.django_db
def test_chat_parser_extracts_reply_from_alternative_json_keys():
    user = User.objects.create_user(email="agent_parse_alt@example.com", password="pass")
    folder, _ = _create_base_program(user)
    thread = LLMProgramThread.objects.create(user=user, program=folder, title="Чат")
    service = LLMProgramChatService(thread)

    parsed = service._parse_chat_response('{"message":"Давай уменьшим объем во вторник","actions":[]}')

    assert parsed["assistant_reply"] == "Давай уменьшим объем во вторник"
    assert parsed["actions"] == []


@pytest.mark.django_db
def test_chat_parser_generates_human_reply_when_actions_without_text():
    user = User.objects.create_user(email="agent_parse_actions@example.com", password="pass")
    folder, te = _create_base_program(user)
    thread = LLMProgramThread.objects.create(user=user, program=folder, title="Чат")
    service = LLMProgramChatService(thread)

    parsed = service._parse_chat_response(
        '{"actions":[{"type":"update_weight","template_exercise_id":%d,"weight":42}]}' % te.id
    )

    assert "Подготовил предложения" in parsed["assistant_reply"]
    assert isinstance(parsed["actions"], list)
    assert len(parsed["actions"]) == 1


@pytest.mark.django_db
def test_chat_send_logs_llm_request_and_response(monkeypatch):
    user = User.objects.create_user(email="agent_log_ok@example.com", password="pass")
    folder, _ = _create_base_program(user)
    thread = LLMProgramThread.objects.create(user=user, program=folder, title="Чат")
    service = LLMProgramChatService(thread)

    monkeypatch.setattr(
        service,
        "_call_llm",
        lambda messages: '{"assistant_reply":"Добавим упражнение на пресс","actions":[]}',
    )

    assistant = service.send("Хочу добавить упражнений на пресс")

    log = LLMRequestLog.objects.filter(user=user).order_by("-id").first()
    assert assistant.role == LLMProgramMessage.Role.ASSISTANT
    assert assistant.content == "Добавим упражнение на пресс"
    assert log is not None
    assert log.status == "chat_ok"
    assert log.success is True
    assert isinstance(log.payload, list)
    assert isinstance(log.response, dict)
    assert log.response.get("raw")


@pytest.mark.django_db
def test_chat_send_logs_unavailable_error(monkeypatch):
    user = User.objects.create_user(email="agent_log_fail@example.com", password="pass")
    folder, _ = _create_base_program(user)
    thread = LLMProgramThread.objects.create(user=user, program=folder, title="Чат")
    service = LLMProgramChatService(thread)

    def _raise(_messages):
        raise LLMUnavailableError("openrouter_timeout")

    monkeypatch.setattr(service, "_call_llm", _raise)

    with pytest.raises(LLMUnavailableError):
        service.send("Нужна корректировка")

    log = LLMRequestLog.objects.filter(user=user).order_by("-id").first()
    assert log is not None
    assert log.status == "chat_unavailable"
    assert log.success is False
    assert "openrouter_timeout" in (log.error_message or "")


@pytest.mark.django_db
def test_chat_parser_extracts_reply_from_malformed_json():
    user = User.objects.create_user(email="agent_parse_broken@example.com", password="pass")
    folder, _ = _create_base_program(user)
    thread = LLMProgramThread.objects.create(user=user, program=folder, title="Чат")
    service = LLMProgramChatService(thread)

    parsed = service._parse_chat_response(
        '{"assistant_reply": "Я могу добавить новые упражнения для пресса в \\"'
    )

    assert parsed["assistant_reply"].startswith("Я могу добавить новые упражнения для пресса")
    assert parsed["actions"] == []


@pytest.mark.django_db
def test_apply_actions_accepts_action_type_alias_for_add_exercise():
    user = User.objects.create_user(email="agent_alias_apply@example.com", password="pass")
    folder = ProgramFolder.objects.create(user=user, name="Силовая alias")
    day = DayTemplate.objects.create(
        folder=folder,
        name="День 1",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0]},
    )
    Exercise_DB.objects.create(
        id="alias_crunch",
        name_en="Crunch",
        name_ru="Скручивания",
        force_en="pull",
        force_ru="",
        level_en="beginner",
        level_ru="начальный",
        mechanic_en="isolation",
        mechanic_ru="",
        equipment_en="body_only",
        equipment_ru="без оборудования",
        category_en="strength",
        category_ru="Силовая",
        default_sets=3,
        default_reps=15,
    )
    thread = LLMProgramThread.objects.create(user=user, program=folder, title="Чат")
    message = LLMProgramMessage.objects.create(
        thread=thread,
        role=LLMProgramMessage.Role.ASSISTANT,
        content="Добавим упражнение на пресс",
        actions=[
            {
                "action_type": "add_exercise_to_day",
                "day_id": day.id,
                "exercise_id": "alias_crunch",
                "sets": 3,
                "reps": 15,
                "rest": 60,
            }
        ],
        proposal_status=LLMProgramMessage.ProposalStatus.PENDING,
    )

    client = APIClient()
    client.force_authenticate(user=user)
    response = client.post(
        f"/api/llm-agent/threads/{thread.id}/apply/",
        {"message_id": message.id},
        format="json",
    )

    assert response.status_code == 200
    assert TemplateExercise.objects.filter(template=day, exercise_id="alias_crunch").exists()


@pytest.mark.django_db
def test_apply_actions_resolves_exercise_by_name_when_exercise_name_missing():
    user = User.objects.create_user(email="agent_alias_name@example.com", password="pass")
    folder = ProgramFolder.objects.create(user=user, name="Силовая alias name")
    day = DayTemplate.objects.create(
        folder=folder,
        name="День 1",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0]},
    )
    Exercise_DB.objects.create(
        id="plank_custom_id",
        name_en="Plank",
        name_ru="Планка",
        force_en="static",
        force_ru="",
        level_en="beginner",
        level_ru="начальный",
        mechanic_en="isolation",
        mechanic_ru="",
        equipment_en="body_only",
        equipment_ru="без оборудования",
        category_en="strength",
        category_ru="Силовая",
        has_time=True,
        default_sets=3,
        default_time=60,
    )
    thread = LLMProgramThread.objects.create(user=user, program=folder, title="Чат")
    message = LLMProgramMessage.objects.create(
        thread=thread,
        role=LLMProgramMessage.Role.ASSISTANT,
        content="Добавим планку",
        actions=[
            {
                "action_type": "add_exercise_to_day",
                "day_id": day.id,
                "exercise_id": "Plank",  # не id, а имя упражнения
                "name": "Планка",
                "sets": 3,
                "time": 60,
                "rest": 45,
            }
        ],
        proposal_status=LLMProgramMessage.ProposalStatus.PENDING,
    )

    client = APIClient()
    client.force_authenticate(user=user)
    response = client.post(
        f"/api/llm-agent/threads/{thread.id}/apply/",
        {"message_id": message.id},
        format="json",
    )

    assert response.status_code == 200
    assert TemplateExercise.objects.filter(template=day, exercise_id="plank_custom_id").exists()


@pytest.mark.django_db
def test_apply_actions_skips_invalid_actions_and_applies_valid_ones():
    user = User.objects.create_user(email="agent_partial_apply@example.com", password="pass")
    folder = ProgramFolder.objects.create(user=user, name="Силовая partial")
    day = DayTemplate.objects.create(
        folder=folder,
        name="День 1",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0]},
    )
    Exercise_DB.objects.create(
        id="plank_partial",
        name_en="Plank",
        name_ru="Планка",
        force_en="static",
        force_ru="",
        level_en="beginner",
        level_ru="начальный",
        mechanic_en="isolation",
        mechanic_ru="",
        equipment_en="body_only",
        equipment_ru="без оборудования",
        category_en="strength",
        category_ru="Силовая",
        has_time=True,
        default_sets=3,
        default_time=60,
    )
    thread = LLMProgramThread.objects.create(user=user, program=folder, title="Чат")
    message = LLMProgramMessage.objects.create(
        thread=thread,
        role=LLMProgramMessage.Role.ASSISTANT,
        content="Добавим упражнения",
        actions=[
            {
                "action_type": "add_exercise_to_day",
                "day_id": day.id,
                "exercise_id": "missing_exercise",
                "name": "Несуществующее",
                "sets": 3,
            },
            {
                "action_type": "add_exercise_to_day",
                "day_id": day.id,
                "exercise_id": "plank_partial",
                "name": "Планка",
                "sets": 3,
                "time": 60,
            },
        ],
        proposal_status=LLMProgramMessage.ProposalStatus.PENDING,
    )

    client = APIClient()
    client.force_authenticate(user=user)
    response = client.post(
        f"/api/llm-agent/threads/{thread.id}/apply/",
        {"message_id": message.id},
        format="json",
    )

    assert response.status_code == 200
    applied = response.data.get("applied", [])
    assert any(item.get("status") == "skipped" for item in applied)
    assert TemplateExercise.objects.filter(template=day, exercise_id="plank_partial").exists()
    message.refresh_from_db()
    assert message.proposal_status == LLMProgramMessage.ProposalStatus.APPLIED


@pytest.mark.django_db
def test_apply_actions_resolves_weekday_name_to_existing_weekly_day():
    user = User.objects.create_user(email="agent_weekday_existing@example.com", password="pass")
    folder = ProgramFolder.objects.create(user=user, name="Силовая weekday existing")
    day = DayTemplate.objects.create(
        folder=folder,
        name="Среда пресс",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [2]},
    )
    Exercise_DB.objects.create(
        id="weekday_plank",
        name_en="Plank",
        name_ru="Планка",
        force_en="static",
        force_ru="",
        level_en="beginner",
        level_ru="начальный",
        mechanic_en="isolation",
        mechanic_ru="",
        equipment_en="body_only",
        equipment_ru="без оборудования",
        category_en="strength",
        category_ru="Силовая",
        has_time=True,
        default_sets=3,
        default_time=60,
    )
    thread = LLMProgramThread.objects.create(user=user, program=folder, title="Чат")
    message = LLMProgramMessage.objects.create(
        thread=thread,
        role=LLMProgramMessage.Role.ASSISTANT,
        content="Добавим в среду",
        actions=[
            {
                "action_type": "add_exercise_to_day",
                "day_name": "среда",
                "exercise_id": "weekday_plank",
                "sets": 3,
                "time": 60,
            }
        ],
        proposal_status=LLMProgramMessage.ProposalStatus.PENDING,
    )

    client = APIClient()
    client.force_authenticate(user=user)
    response = client.post(
        f"/api/llm-agent/threads/{thread.id}/apply/",
        {"message_id": message.id},
        format="json",
    )

    assert response.status_code == 200
    assert TemplateExercise.objects.filter(template=day, exercise_id="weekday_plank").exists()


@pytest.mark.django_db
def test_apply_actions_creates_weekday_day_when_missing():
    user = User.objects.create_user(email="agent_weekday_create@example.com", password="pass")
    folder = ProgramFolder.objects.create(user=user, name="Силовая weekday create")
    Exercise_DB.objects.create(
        id="weekday_crunch",
        name_en="Crunches",
        name_ru="Скручивания",
        force_en="pull",
        force_ru="",
        level_en="beginner",
        level_ru="начальный",
        mechanic_en="isolation",
        mechanic_ru="",
        equipment_en="body_only",
        equipment_ru="без оборудования",
        category_en="strength",
        category_ru="Силовая",
        default_sets=3,
        default_reps=15,
    )
    thread = LLMProgramThread.objects.create(user=user, program=folder, title="Чат")
    message = LLMProgramMessage.objects.create(
        thread=thread,
        role=LLMProgramMessage.Role.ASSISTANT,
        content="Создадим среду",
        actions=[
            {
                "action_type": "add_exercise_to_day",
                "day_name": "среда",
                "exercise_id": "weekday_crunch",
                "sets": 3,
                "reps": 15,
            }
        ],
        proposal_status=LLMProgramMessage.ProposalStatus.PENDING,
    )

    client = APIClient()
    client.force_authenticate(user=user)
    response = client.post(
        f"/api/llm-agent/threads/{thread.id}/apply/",
        {"message_id": message.id},
        format="json",
    )

    assert response.status_code == 200
    created_day = DayTemplate.objects.filter(folder=folder, schedule_type=DayTemplate.ScheduleType.WEEKLY).first()
    assert created_day is not None
    assert (created_day.schedule_config or {}).get("days_of_week") == [2]
    assert TemplateExercise.objects.filter(template=created_day, exercise_id="weekday_crunch").exists()
