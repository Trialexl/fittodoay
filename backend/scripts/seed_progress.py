from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from decimal import Decimal

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "fittodoey_backend.settings")
# ensure project root is on path
CURRENT_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)
django.setup()

from accounts.models import User  # noqa: E402
from programs.models import TemplateExercise  # noqa: E402
from workouts.models import WorkoutSetLog  # noqa: E402
from workouts.services import generate_daily_plan, update_workout_status  # noqa: E402

EMAIL = "seed-user@example.com"
START_DATE = date(2025, 9, 1)
END_DATE = date.today()
WEIGHT_STEP = Decimal("2.0")
WEIGHT_RESET_REPS = 8


def daterange(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def init_state(defaults: dict) -> dict:
    base_reps = defaults.get("reps") or 10
    base_weight = defaults.get("weight")
    base_time = defaults.get("time") or 30
    return {
        "base_reps": base_reps,
        "rep_target": base_reps,
        "base_weight": base_weight,
        "weight_target": base_weight,
        "base_time": base_time,
        "time_target": base_time,
        "sessions": 0,
        "has_time": defaults.get("has_time"),
        "has_weight": defaults.get("has_weight"),
    }


def simulate(values: dict, set_index: int):
    values["sessions"] += 1
    if values["has_time"]:
        variation = (values["sessions"] % 3) - 1
        actual = max(10, int(values["time_target"]) + variation)
        if values["sessions"] % 5 == 0:
            values["time_target"] += 5
        return {"time": actual, "reps": None, "weight": None}

    variation = 1 if (values["sessions"] + set_index) % 4 == 0 else 0
    actual_reps = max(1, int(values["rep_target"]) + variation)
    actual_weight = (
        float(values["weight_target"]) if values["weight_target"] is not None else None
    )
    return {"reps": actual_reps, "weight": actual_weight, "time": None}


def adjust_progress(values: dict):
    if values["has_time"]:
        return

    if values["sessions"] % 3 == 0:
        values["rep_target"] += 1

    base_reps = values["base_reps"]
    if values["rep_target"] > base_reps + 4:
        values["rep_target"] = base_reps + 4

    if values["has_weight"] and values["weight_target"] is not None:
        if values["rep_target"] >= base_reps + 4:
            values["weight_target"] = float(
                Decimal(str(values["weight_target"])) + WEIGHT_STEP
            )
            values["rep_target"] = min(base_reps, WEIGHT_RESET_REPS)


def main():
    user = User.objects.filter(email=EMAIL).first()
    if not user:
        raise SystemExit(f"User {EMAIL} not found")

    progress_state: dict[int, dict] = {}
    template_cache: dict[int, TemplateExercise] = {}

    for target_date in daterange(START_DATE, END_DATE):
        day = generate_daily_plan(user, target_date=target_date)
        if not day.plan_snapshot.get("folders"):
            continue
        WorkoutSetLog.objects.filter(workout_day=day).delete()

        for folder in day.plan_snapshot.get("folders", []):
            for template in folder.get("templates", []):
                for exercise in template.get("exercises", []):
                    te_id = exercise.get("template_exercise_id")
                    if not te_id:
                        continue
                    defaults = exercise.get("defaults") or {}
                    state = progress_state.setdefault(te_id, init_state(defaults))
                    if te_id not in template_cache:
                        template_cache[te_id] = TemplateExercise.objects.get(id=te_id)
                    te_obj = template_cache[te_id]

                    for set_data in exercise.get("sets", []):
                        metrics = simulate(state, set_data.get("set_index", 0))
                        WorkoutSetLog.objects.create(
                            workout_day=day,
                            template_exercise=te_obj,
                            set_index=set_data.get("set_index", 0),
                            actual_reps=metrics["reps"],
                            actual_weight=metrics["weight"],
                            actual_time=metrics["time"],
                        )
                    adjust_progress(state)

        update_workout_status(day)
    print(f"Seeded workouts for {EMAIL} from {START_DATE} to {END_DATE}")


if __name__ == "__main__":
    main()
