from __future__ import annotations

from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model

from analytics.services import aggregate_daily_loads, aggregate_exercise_loads
from programs.models import ProgramFolder, DayTemplate, TemplateExercise
from workouts.models import WorkoutDay, WorkoutSetLog, Exercise_DB

User = get_user_model()


@pytest.mark.django_db
def test_aggregate_daily_loads_handles_weight_and_time():
    user = User.objects.create_user(email="test@example.com", password="password")
    folder = ProgramFolder.objects.create(user=user, name="Основные")
    template = DayTemplate.objects.create(
        folder=folder,
        name="Понедельник",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0]},
    )
    exercise = Exercise_DB.objects.create(
        id="bench_press",
        name_en="Bench Press",
        name_ru="Жим лежа",
        force_en="push",
        force_ru="",
        level_en="intermediate",
        level_ru="средний",
        mechanic_en="compound",
        mechanic_ru="",
        equipment_en="barbell",
        equipment_ru="штанга",
        category_en="strength",
        category_ru="Силовая",
        has_weight=True,
        default_weight=50,
        default_reps=10,
        default_sets=3,
    )
    template_exercise = TemplateExercise.objects.create(
        template=template,
        exercise=exercise,
        set_override=3,
    )
    workout_day = WorkoutDay.objects.create(user=user, date=date.today())
    WorkoutSetLog.objects.create(
        workout_day=workout_day,
        template_exercise=template_exercise,
        set_index=1,
        actual_weight=60,
        actual_reps=8,
    )
    WorkoutSetLog.objects.create(
        workout_day=workout_day,
        template_exercise=template_exercise,
        set_index=2,
        actual_time=60,
    )
    stats = aggregate_daily_loads(user, start=date.today(), end=date.today())
    assert stats[0]["load"] == pytest.approx((60 * 8) + (60 / 10), rel=1e-3)


@pytest.mark.django_db
def test_aggregate_exercise_loads_sums_per_entry():
    user = User.objects.create_user(email="user@example.com", password="password")
    folder = ProgramFolder.objects.create(user=user, name="Основные")
    template = DayTemplate.objects.create(
        folder=folder,
        name="Среда",
        schedule_type=DayTemplate.ScheduleType.INTERVAL,
        schedule_config={"every_x_days": 2},
    )
    exercise = Exercise_DB.objects.create(
        id="squat",
        name_en="Squat",
        name_ru="Присед",
        force_en="push",
        force_ru="",
        level_en="intermediate",
        level_ru="средний",
        mechanic_en="compound",
        mechanic_ru="",
        equipment_en="barbell",
        equipment_ru="штанга",
        category_en="strength",
        category_ru="Силовая",
        has_weight=True,
        default_weight=70,
        default_reps=8,
        default_sets=3,
    )
    template_exercise = TemplateExercise.objects.create(
        template=template,
        exercise=exercise,
        set_override=2,
    )
    day1 = WorkoutDay.objects.create(user=user, date=date.today())
    day2 = WorkoutDay.objects.create(user=user, date=date.today() + timedelta(days=2))
    for idx in range(2):
        WorkoutSetLog.objects.create(
            workout_day=day1,
            template_exercise=template_exercise,
            set_index=idx + 1,
            actual_weight=70,
            actual_reps=8,
        )
    WorkoutSetLog.objects.create(
        workout_day=day2,
        template_exercise=template_exercise,
        set_index=1,
        actual_weight=75,
        actual_reps=6,
    )
    summary = aggregate_exercise_loads(
        user,
        start=date.today() - timedelta(days=1),
        end=date.today() + timedelta(days=2),
    )
    assert summary[0]["load"] == pytest.approx((70 * 8 * 2) + (75 * 6), rel=1e-3)
