from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from django.contrib.auth import get_user_model

from programs.models import DayTemplate, ProgramFolder, TemplateExercise
from workouts.models import Exercise_DB, WorkoutSetLog
from workouts.recommendations import generate_recommendations_for_day
from workouts.services import generate_daily_plan, template_matches_date

User = get_user_model()
TEST_DATE = date(2024, 6, 3)  # Monday


def _build_exercise(
    *,
    has_weight: bool = True,
    has_time: bool = False,
    default_sets: int = 3,
    default_reps: int = 10,
    default_weight: float = 20,
) -> Exercise_DB:
    return Exercise_DB.objects.create(
        id=f"ex_{uuid4().hex[:8]}",
        name_en="Dumbbell Row",
        name_ru="Тяга гантели",
        force_en="pull",
        force_ru="",
        level_en="beginner",
        level_ru="начальный",
        mechanic_en="compound",
        mechanic_ru="",
        equipment_en="dumbbell",
        equipment_ru="гантели",
        category_en="strength",
        category_ru="Силовая",
        has_weight=has_weight,
        has_time=has_time,
        default_sets=default_sets,
        default_reps=default_reps,
        default_weight=default_weight if has_weight else None,
        default_time=45 if has_time else None,
    )


def _build_template_exercise(
    user,
    *,
    rep_override: int = 12,
    set_override: int = 3,
    weight_override: float | None = 24,
    has_weight: bool = True,
    has_time: bool = False,
) -> TemplateExercise:
    folder = ProgramFolder.objects.create(user=user, name=f"Основные {uuid4().hex[:6]}")
    template = DayTemplate.objects.create(
        folder=folder,
        name=f"День {uuid4().hex[:4]}",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0]},
    )
    exercise = _build_exercise(
        has_weight=has_weight,
        has_time=has_time,
        default_sets=set_override,
        default_reps=rep_override if rep_override else 10,
        default_weight=weight_override or 20,
    )
    return TemplateExercise.objects.create(
        template=template,
        exercise=exercise,
        set_override=set_override,
        rep_override=rep_override,
        weight_override=weight_override if has_weight else None,
    )


def _build_day_with_logs(
    user,
    *,
    rep_override: int = 12,
    set_override: int = 3,
    weight_override: float | None = 24,
    actual_reps: list[int | None] | None = None,
    actual_weights: list[float | None] | None = None,
    has_weight: bool = True,
    has_time: bool = False,
):
    te = _build_template_exercise(
        user,
        rep_override=rep_override,
        set_override=set_override,
        weight_override=weight_override,
        has_weight=has_weight,
        has_time=has_time,
    )
    day = generate_daily_plan(user, target_date=TEST_DATE)
    reps = actual_reps or [rep_override] * set_override
    weights = actual_weights or [weight_override] * set_override
    for idx in range(min(len(reps), len(weights))):
        WorkoutSetLog.objects.create(
            workout_day=day,
            template_exercise=te,
            set_index=idx + 1,
            actual_reps=reps[idx],
            actual_weight=Decimal(str(weights[idx])) if has_weight and weights[idx] is not None else None,
            actual_time=45 if has_time else None,
        )
    return day, te


def _first_recommendation(day):
    folders = generate_recommendations_for_day(day)
    assert folders, "Ожидали хотя бы одну папку с рекомендациями"
    assert folders[0]["recommendations"], "Ожидали хотя бы одну рекомендацию"
    return folders[0]["recommendations"][0]


@pytest.mark.django_db
def test_template_matches_weekly_day():
    folder = ProgramFolder.objects.create(user=User.objects.create_user("a@a.a"), name="Тестовая папка")
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
    primary = ProgramFolder.objects.get(user=user, name="Основные")
    primary.sort_order = 0
    primary.save(update_fields=["sort_order"])
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


@pytest.mark.django_db
def test_recommendation_increase_weight_on_top_rep_range():
    user = User.objects.create_user(email="toprange@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=12,
        weight_override=24,
        actual_reps=[12, 12, 12],
        actual_weights=[24, 24, 24],
    )
    rec = _first_recommendation(day)

    assert rec["action"] == "increase_weight"
    assert rec["suggested_weight"] == 26.0
    assert rec["suggested_reps"] == 8


@pytest.mark.django_db
def test_recommendation_increase_reps_before_weight_cycle():
    user = User.objects.create_user(email="repscycle@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=10,
        weight_override=24,
        actual_reps=[10, 10, 10],
        actual_weights=[24, 24, 24],
    )
    rec = _first_recommendation(day)

    assert rec["action"] == "increase_reps_after_weight"
    assert rec["suggested_reps"] == 11
    assert rec["suggested_weight"] is None


@pytest.mark.django_db
def test_recommendation_align_weight_when_actual_is_higher():
    user = User.objects.create_user(email="align@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=12,
        weight_override=24,
        actual_reps=[12, 12, 12],
        actual_weights=[25, 25, 25],
    )
    rec = _first_recommendation(day)

    assert rec["action"] == "align_weight"
    assert rec["suggested_weight"] == 26.0
    assert rec["suggested_reps"] == 12


@pytest.mark.django_db
def test_recommendation_reduce_weight_to_actual_when_too_low():
    user = User.objects.create_user(email="reduce@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=10,
        weight_override=24,
        actual_reps=[10, 10, 10],
        actual_weights=[21, 21, 21],
    )
    rec = _first_recommendation(day)

    assert rec["action"] == "reduce_weight_to_actual"
    assert rec["suggested_weight"] == 22.0


@pytest.mark.django_db
def test_recommendation_informational_when_reps_near_lower_bound():
    user = User.objects.create_user(email="info@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=10,
        weight_override=24,
        actual_reps=[8, 8, 8],
        actual_weights=[24, 24, 24],
    )
    rec = _first_recommendation(day)

    assert rec["action"] == "info_low_reps"
    assert rec["informational"] is True
    assert rec["suggested_reps"] is None
    assert rec["suggested_weight"] is None


@pytest.mark.django_db
def test_recommendation_adjust_reps_when_plan_out_of_range():
    user = User.objects.create_user(email="adjust@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=15,
        weight_override=24,
        actual_reps=[10, 10, 10],
        actual_weights=[23.4, 23.4, 23.4],
    )
    rec = _first_recommendation(day)

    assert rec["action"] == "adjust_reps"
    assert rec["suggested_reps"] == 12


@pytest.mark.django_db
def test_recommendation_absent_for_incomplete_folder_sets():
    user = User.objects.create_user(email="incomplete@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=12,
        set_override=3,
        weight_override=24,
        actual_reps=[12, 12],
        actual_weights=[24, 24],
    )

    assert generate_recommendations_for_day(day) == []


@pytest.mark.django_db
def test_recommendation_skips_time_based_exercise():
    user = User.objects.create_user(email="timer@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=10,
        set_override=3,
        weight_override=None,
        actual_reps=[None, None, None],
        actual_weights=[None, None, None],
        has_weight=False,
        has_time=True,
    )

    assert generate_recommendations_for_day(day) == []
