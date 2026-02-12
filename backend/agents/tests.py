from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from agents.models import LLMProgramMessage, LLMProgramThread
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
