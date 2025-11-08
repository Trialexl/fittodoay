from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Dict, List

from django.db.models import Prefetch

from programs.models import TemplateExercise
from workouts.models import WorkoutSetLog
from workouts.services import resolve_defaults

TIME_COEFFICIENT = 10  # 10 секунд = 1 повтор


def _compute_load(log: WorkoutSetLog) -> float:
    defaults = {}
    if log.template_exercise:
        defaults = resolve_defaults(log.template_exercise)
    reps = log.actual_reps
    weight = log.actual_weight
    time_sec = log.actual_time

    if weight and reps:
        return float(weight) * reps

    if reps:
        return float(reps)

    if time_sec:
        return time_sec / TIME_COEFFICIENT

    if defaults.get("weight") and defaults.get("reps"):
        return float(defaults["weight"]) * defaults["reps"]

    if defaults.get("reps"):
        return float(defaults["reps"])

    if defaults.get("time"):
        return defaults["time"] / TIME_COEFFICIENT

    return 0.0


def aggregate_daily_loads(user, start: date, end: date) -> List[Dict]:
    logs = (
        WorkoutSetLog.objects.filter(
            workout_day__user=user,
            workout_day__date__range=(start, end),
        )
        .select_related(
            "workout_day",
            "template_exercise__exercise",
            "template_exercise__custom_exercise",
        )
        .order_by("workout_day__date")
    )
    daily = defaultdict(float)
    for log in logs:
        daily[log.workout_day.date] += _compute_load(log)
    result = []
    cursor = start
    while cursor <= end:
        result.append({"date": cursor.isoformat(), "load": round(daily[cursor], 2)})
        cursor += timedelta(days=1)
    return result


def aggregate_exercise_loads(user, start: date, end: date) -> List[Dict]:
    logs = (
        WorkoutSetLog.objects.filter(
            workout_day__user=user,
            workout_day__date__range=(start, end),
        )
        .select_related(
            "template_exercise__exercise",
            "template_exercise__custom_exercise",
        )
        .order_by("template_exercise__exercise__name")
    )
    per_exercise = defaultdict(lambda: {"load": 0.0, "sets": 0})
    for log in logs:
        te = log.template_exercise
        if not te:
            continue
        source = te.exercise or te.custom_exercise
        if not source:
            continue
        key = f"{'sys' if te.exercise else 'custom'}:{source.id}"
        per_exercise[key]["name"] = source.name
        per_exercise[key]["type"] = "system" if te.exercise else "custom"
        per_exercise[key]["load"] += _compute_load(log)
        per_exercise[key]["sets"] += 1

    return [
        {
            "id": key,
            "name": data["name"],
            "type": data["type"],
            "load": round(data["load"], 2),
            "sets": data["sets"],
        }
        for key, data in per_exercise.items()
    ]


def build_ai_feed(user, limit: int = 50) -> List[Dict]:
    logs = (
        WorkoutSetLog.objects.filter(workout_day__user=user)
        .select_related(
            "workout_day",
            "template_exercise__exercise",
            "template_exercise__custom_exercise",
        )
        .order_by("-created_at")[:limit]
    )
    feed = []
    for log in logs:
        te = log.template_exercise
        src = te.exercise if te and te.exercise else te.custom_exercise if te else None
        feed.append(
            {
                "date": log.workout_day.date.isoformat(),
                "exercise_name": src.name if src else "unknown",
                "type": "system" if te and te.exercise else "custom",
                "set_index": log.set_index,
                "actual_reps": log.actual_reps,
                "actual_weight": float(log.actual_weight) if log.actual_weight else None,
                "actual_time": log.actual_time,
                "load": _compute_load(log),
            }
        )
    return feed
