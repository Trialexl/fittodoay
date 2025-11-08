from __future__ import annotations

from datetime import date

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from programs.models import DayTemplate, ProgramFolder, TemplateExercise
from exercises.models import Exercise

User = get_user_model()


@pytest.mark.django_db
def test_template_creation_with_exercises():
    user = User.objects.create_user(email="prog@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)
    folder = ProgramFolder.objects.create(user=user, name="Основные")
    exercise = Exercise.objects.create(
        name="Тяга штанги",
        target_muscles="спина",
        default_sets=4,
        default_reps=8,
    )
    resp = client.post(
        "/api/programs/templates/",
        {
            "folder": folder.id,
            "name": "Спина",
            "comment": "",
            "schedule_type": DayTemplate.ScheduleType.WEEKLY,
            "schedule_config": {"days_of_week": [2]},
            "template_exercises": [
                {
                    "exercise_id": exercise.id,
                    "rep_override": 10,
                    "set_override": 3,
                }
            ],
        },
        format="json",
    )
    assert resp.status_code == 201, resp.content
    template = DayTemplate.objects.get(id=resp.data["id"])
    assert template.template_exercises.count() == 1
    te = template.template_exercises.first()
    assert te.rep_override == 10


@pytest.mark.django_db
def test_default_folder_created_on_user_signup():
    user = User.objects.create_user(email="auto@example.com", password="pass")
    folder_qs = ProgramFolder.objects.filter(user=user, name="Основные")
    assert folder_qs.exists()
