from __future__ import annotations

from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model

from programs.models import DayTemplate, ProgramFolder, TemplateExercise
from workouts.models import Exercise_DB
from workouts.services import generate_daily_plan, template_matches_date

User = get_user_model()


@pytest.mark.django_db
def test_template_matches_weekly_day():
    folder = ProgramFolder.objects.create(user=User.objects.create_user("a@a.a"), name="Основные")
    template = DayTemplate.objects.create(
        folder=folder,
        name="Monday",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0, 2]},
    )
    assert template_matches_date(template, date(2024, 6, 3))  # Monday
    assert not template_matches_date(template, date(2024, 6, 4))  # Tuesday


@pytest.mark.django_db
def test_generate_daily_plan_prioritizes_primary_folder():
    user = User.objects.create_user(email="user@example.com", password="pass")
    primary = ProgramFolder.objects.create(user=user, name="Основные", sort_order=0)
    extra = ProgramFolder.objects.create(user=user, name="Доп", sort_order=1)
    template_primary = DayTemplate.objects.create(
        folder=primary,
        name="Понедельник Грудь",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0]},
    )
    template_extra = DayTemplate.objects.create(
        folder=extra,
        name="Йога",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0]},
    )
    exercise = Exercise_DB.objects.create(
        id="db_press",
        name_en="Dumbbell Press",
        name_ru="Жим гантелей",
        force_en="push",
        force_ru="",
        level_en="beginner",
        level_ru="начальный",
        mechanic_en="compound",
        mechanic_ru="",
        equipment_en="dumbbell",
        equipment_ru="гантели",
        category_en="strength",
        category_ru="Силовая",
        default_sets=3,
        default_reps=10,
        has_weight=True,
        default_weight=20,
    )
    TemplateExercise.objects.create(template=template_primary, exercise=exercise)
    TemplateExercise.objects.create(template=template_extra, exercise=exercise)
    day = generate_daily_plan(user, target_date=date(2024, 6, 3))
    folders = day.plan_snapshot["folders"]
    assert folders[0]["name"].startswith("Основные")
    assert len(folders[0]["templates"]) == 1

# Create your tests here.
