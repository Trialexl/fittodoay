from __future__ import annotations

from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from analytics.services import (
    aggregate_body_weight,
    aggregate_daily_loads,
    aggregate_exercise_loads,
    build_program_trends,
)
from programs.models import ProgramFolder, DayTemplate, TemplateExercise
from workouts.models import WorkoutDay, WorkoutSetLog, Exercise_DB, WorkoutWeighIn

User = get_user_model()


@pytest.mark.django_db
def test_aggregate_daily_loads_handles_weight_and_time():
    user = User.objects.create_user(email="test@example.com", password="password")
    folder = ProgramFolder.objects.get(user=user, name="Основные")
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
    folder = ProgramFolder.objects.get(user=user, name="Основные")
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


@pytest.mark.django_db
def test_aggregate_body_weight_returns_daily_series_with_nulls():
    user = User.objects.create_user(email="weightstats@example.com", password="password")
    start = date.today() - timedelta(days=2)
    WorkoutWeighIn.objects.create(user=user, date=start, weight_kg="80.00")
    WorkoutWeighIn.objects.create(user=user, date=start + timedelta(days=2), weight_kg="79.60")

    series = aggregate_body_weight(user, start=start, end=start + timedelta(days=2))
    assert [item["date"] for item in series] == [
        start.isoformat(),
        (start + timedelta(days=1)).isoformat(),
        (start + timedelta(days=2)).isoformat(),
    ]
    assert series[0]["weight_kg"] == 80.0
    assert series[1]["weight_kg"] is None
    assert series[2]["weight_kg"] == 79.6


@pytest.mark.django_db
def test_body_weight_endpoint_returns_user_only_data():
    user = User.objects.create_user(email="weightapi@example.com", password="password")
    other = User.objects.create_user(email="weightapi-other@example.com", password="password")
    today = date.today()
    WorkoutWeighIn.objects.create(user=user, date=today, weight_kg="82.30")
    WorkoutWeighIn.objects.create(user=other, date=today, weight_kg="99.90")
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get(f"/api/analytics/body-weight/?start={today.isoformat()}&end={today.isoformat()}")
    assert response.status_code == 200
    assert response.data["items"][0]["weight_kg"] == 82.3


@pytest.mark.django_db
def test_body_weight_endpoint_defaults_start_to_first_weigh_in():
    user = User.objects.create_user(email="weightapi-start@example.com", password="password")
    client = APIClient()
    client.force_authenticate(user=user)
    first = date.today() - timedelta(days=20)
    last = date.today() - timedelta(days=2)
    WorkoutWeighIn.objects.create(user=user, date=first, weight_kg="84.10")
    WorkoutWeighIn.objects.create(user=user, date=last, weight_kg="82.50")

    response = client.get("/api/analytics/body-weight/")

    assert response.status_code == 200
    assert response.data["start"] == first.isoformat()
    assert response.data["end"] == date.today().isoformat()
    assert response.data["items"][0]["date"] == first.isoformat()
    assert response.data["items"][-1]["date"] == date.today().isoformat()


@pytest.mark.django_db
def test_build_program_trends_includes_daily_average_weight_for_exercise():
    user = User.objects.create_user(email="trend-weight@example.com", password="password")
    folder = ProgramFolder.objects.get(user=user, name="Основные")
    template = DayTemplate.objects.create(
        folder=folder,
        name="Пятница",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [4]},
    )
    exercise = Exercise_DB.objects.create(
        id="incline_bench_press",
        name_en="Incline Bench Press",
        name_ru="Жим гантелей на наклонной",
        force_en="push",
        force_ru="",
        level_en="intermediate",
        level_ru="средний",
        mechanic_en="compound",
        mechanic_ru="",
        equipment_en="dumbbell",
        equipment_ru="гантели",
        category_en="strength",
        category_ru="Силовая",
        has_weight=True,
        default_weight=24,
        default_reps=10,
        default_sets=3,
    )
    template_exercise = TemplateExercise.objects.create(template=template, exercise=exercise, set_override=3)
    day_1 = date.today() - timedelta(days=2)
    day_2 = date.today()
    workout_day_1 = WorkoutDay.objects.create(user=user, date=day_1)
    workout_day_2 = WorkoutDay.objects.create(user=user, date=day_2)

    WorkoutSetLog.objects.create(
        workout_day=workout_day_1,
        template_exercise=template_exercise,
        set_index=1,
        actual_weight=24,
        actual_reps=10,
    )
    WorkoutSetLog.objects.create(
        workout_day=workout_day_1,
        template_exercise=template_exercise,
        set_index=2,
        actual_weight=26,
        actual_reps=9,
    )
    WorkoutSetLog.objects.create(
        workout_day=workout_day_2,
        template_exercise=template_exercise,
        set_index=1,
        actual_weight=28,
        actual_reps=8,
    )

    folders, trimmed_start, trimmed_end = build_program_trends(
        user,
        start=day_1,
        end=day_2,
        granularity="day",
    )

    assert trimmed_start == day_1
    assert trimmed_end == day_2
    assert len(folders) == 1

    exercise_series = folders[0]["exercises"][0]["series"]
    by_date = {item["date"]: item for item in exercise_series}
    assert by_date[day_1.isoformat()]["avg_weight"] == 25.0
    assert by_date[day_1.isoformat()]["weight_sets"] == 2
    assert by_date[day_2.isoformat()]["avg_weight"] == 28.0
    assert by_date[day_2.isoformat()]["weight_sets"] == 1
