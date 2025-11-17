from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import Dict, List, Optional

from django.db import transaction
from django.db.models import Count

from programs.models import TemplateExercise
from workouts.models import WorkoutDay, WorkoutSetLog
from workouts.services import resolve_defaults

REPS_INCREASE_THRESHOLD = 4
WEIGHT_STEP = Decimal("2.0")
WEIGHT_RESET_REPS = 8


@dataclass
class Recommendation:
    template_exercise_id: int
    exercise_name: str
    template_name: str
    folder_id: int
    folder_name: str
    current_reps: Optional[int]
    current_weight: Optional[float]
    average_reps: Optional[float]
    average_weight: Optional[float]
    suggested_reps: Optional[int]
    suggested_weight: Optional[float]
    has_weight: bool
    reason: Optional[str] = None
    action: Optional[str] = None


def _average(values: List[float | None]) -> Optional[float]:
    filtered = [float(value) for value in values if value is not None]
    if not filtered:
        return None
    return sum(filtered) / len(filtered)


def _build_snapshot_index(day: WorkoutDay):
    plan = day.plan_snapshot or {}
    template_index: Dict[int, Dict] = {}
    folder_names: Dict[int, str] = {}
    for folder in plan.get("folders", []):
        folder_id = folder.get("id")
        if folder_id is None:
            continue
        folder_names[folder_id] = folder.get("name") or f"Папка {folder_id}"
        for template in folder.get("templates", []):
            template_id = template.get("id")
            template_name = template.get("name") or f"День {template_id}"
            for exercise in template.get("exercises", []):
                te_id = exercise.get("template_exercise_id")
                if not te_id:
                    continue
                template_index[te_id] = {
                    "folder_id": folder_id,
                    "folder_name": folder_names[folder_id],
                    "template_id": template_id,
                    "template_name": template_name,
                    "expected_sets": len(exercise.get("sets") or []),
                }
    return template_index, folder_names


def _build_recommendation(
    te: TemplateExercise,
    logs: List[WorkoutSetLog],
    *,
    is_first_time: bool = False,
) -> Optional[Recommendation]:
    if not logs:
        return None
    defaults = resolve_defaults(te)
    has_time = defaults.get("has_time")
    if has_time:
        return None

    planned_reps = defaults.get("reps")
    if planned_reps is None:
        return None
    planned_weight = defaults.get("weight")
    has_weight = bool(defaults.get("has_weight"))

    avg_reps = _average([log.actual_reps for log in logs])
    if avg_reps is None:
        return None
    avg_weight = _average(
        [float(log.actual_weight) if log.actual_weight is not None else None for log in logs]
    )

    suggested_reps: Optional[int] = None
    suggested_weight: Optional[float] = None
    reason: Optional[str] = None
    action: Optional[str] = None

    rounded_avg = int(round(avg_reps))

    if (
        has_weight
        and planned_weight is not None
        and avg_weight is not None
        and avg_weight < planned_weight
    ):
        actual_tonnage = avg_weight * avg_reps
        best_weight: Optional[float] = None
        best_reps: Optional[int] = None
        min_diff = float("inf")
        for rep_target in range(max(8, planned_reps - 2), 13):
            for weight_candidate in range(2, int(planned_weight) + 2, 2):
                tonnage = weight_candidate * rep_target
                diff = abs(actual_tonnage - tonnage)
                if diff < min_diff:
                    min_diff = diff
                    best_weight = weight_candidate
                    best_reps = rep_target
        suggested_weight = best_weight or float(round(avg_weight / 2) * 2)
        suggested_reps = best_reps or max(1, int(round(avg_reps)))
        reason = "Плановый вес оказался тяжёлым; корректируем нагрузку под фактические показатели."
        action = "adjust_weight"
    else:
        increase_condition = avg_reps >= planned_reps + REPS_INCREASE_THRESHOLD or (
            is_first_time and avg_reps >= planned_reps
        )
        if has_weight and planned_weight is not None and increase_condition:
            next_weight = Decimal(str(planned_weight)) + WEIGHT_STEP
            suggested_weight = float(next_weight.quantize(Decimal("0.01")))
            suggested_reps = WEIGHT_RESET_REPS
            if is_first_time and avg_reps >= planned_reps and avg_reps < planned_reps + REPS_INCREASE_THRESHOLD:
                reason = f"Первое выполнение и среднее {avg_reps:.1f} повторов — вес был лёгкий, повышаем нагрузку."
            else:
                reason = f"Среднее {avg_reps:.1f} повторов — время увеличить вес."
            action = "increase_weight"
        elif rounded_avg != planned_reps:
            upper_cap = min(12, max(rounded_avg, planned_reps))
            suggested_reps = max(1, upper_cap)
            reason = f"Фактическое среднее {avg_reps:.1f} повторов."
            action = "update_reps"

    if (
        is_first_time
        and has_weight
        and avg_weight is not None
        and suggested_weight is None
    ):
        normalized_weight = round(avg_weight, 2)
        suggested_weight = normalized_weight
        addition = f" Первое выполнение — фиксируем рабочий вес {normalized_weight} кг."
        reason = (reason or "").strip()
        reason = (reason + addition).strip() if reason else addition.strip()
        if not action:
            action = "set_initial_weight"

    if suggested_reps is None and suggested_weight is None:
        return None

    source = te.exercise or te.custom_exercise
    exercise_name = source.name if source else f"Упражнение {te.id}"

    current_weight = float(planned_weight) if planned_weight is not None and has_weight else None

    return Recommendation(
        template_exercise_id=te.id,
        exercise_name=exercise_name,
        template_name=te.template.name,
        folder_id=te.template.folder.id,
        folder_name=te.template.folder.name,
        current_reps=planned_reps,
        current_weight=current_weight,
        average_reps=round(avg_reps, 2),
        average_weight=round(avg_weight, 2) if avg_weight is not None else None,
        suggested_reps=suggested_reps,
        suggested_weight=suggested_weight,
        has_weight=has_weight,
        reason=reason,
        action=action,
    )


def generate_recommendations_for_day(day: WorkoutDay) -> List[Dict]:
    template_index, folder_names = _build_snapshot_index(day)
    if not template_index:
        return []

    te_ids = list(template_index.keys())
    templates = {
        te.id: te
        for te in TemplateExercise.objects.filter(id__in=te_ids).select_related(
            "template__folder", "exercise", "custom_exercise"
        )
    }
    history_counts = {
        row["template_exercise_id"]: row["total"]
        for row in WorkoutSetLog.objects.filter(template_exercise_id__in=te_ids)
        .exclude(workout_day=day)
        .values("template_exercise_id")
        .annotate(total=Count("id"))
    }
    logs = (
        WorkoutSetLog.objects.filter(workout_day=day, template_exercise_id__in=te_ids)
        .select_related("template_exercise")
        .order_by("template_exercise_id", "set_index")
    )
    logs_by_te: Dict[int, List[WorkoutSetLog]] = defaultdict(list)
    for log in logs:
        if log.template_exercise_id:
            logs_by_te[log.template_exercise_id].append(log)

    folder_completed: Dict[int, bool] = {folder_id: True for folder_id in folder_names.keys()}
    for te_id, meta in template_index.items():
        expected = meta.get("expected_sets") or 0
        actual = len(logs_by_te.get(te_id, []))
        if expected and actual < expected:
            folder_completed[meta["folder_id"]] = False

    folders_payload: List[Dict] = []
    for folder_id, folder_name in folder_names.items():
        if not folder_completed.get(folder_id):
            continue
        folder_recs: List[Dict] = []
        for te_id, meta in template_index.items():
            if meta["folder_id"] != folder_id:
                continue
            te = templates.get(te_id)
            if not te:
                continue
            recommendation = _build_recommendation(
                te,
                logs_by_te.get(te_id, []),
                is_first_time=history_counts.get(te_id, 0) == 0,
            )
            if recommendation:
                folder_recs.append(
                    {
                        "template_exercise_id": recommendation.template_exercise_id,
                        "exercise_name": recommendation.exercise_name,
                        "template_name": recommendation.template_name,
                        "current_reps": recommendation.current_reps,
                        "current_weight": recommendation.current_weight,
                        "average_reps": recommendation.average_reps,
                        "average_weight": recommendation.average_weight,
                        "suggested_reps": recommendation.suggested_reps,
                        "suggested_weight": recommendation.suggested_weight,
                        "has_weight": recommendation.has_weight,
                        "reason": recommendation.reason,
                        "action": recommendation.action,
                    }
                )
        if folder_recs:
            first_te_id = folder_recs[0]["template_exercise_id"]
            template_obj = templates.get(first_te_id)
            actual_name = template_obj.template.folder.name if template_obj else folder_name
            folders_payload.append(
                {
                    "folder_id": folder_id,
                    "folder_name": actual_name or folder_name,
                    "recommendations": folder_recs,
                }
            )
    return folders_payload


@transaction.atomic
def apply_recommendations(user, items: List[Dict]) -> int:
    if not items:
        return 0
    te_ids = {item["template_exercise_id"] for item in items}
    templates = {
        te.id: te
        for te in TemplateExercise.objects.filter(id__in=te_ids, template__folder__user=user)
    }
    if len(templates) != len(te_ids):
        raise ValueError("exercise_mismatch")
    updated = 0
    for item in items:
        te = templates[item["template_exercise_id"]]
        update_fields = []
        if "rep_override" in item and item["rep_override"] is not None:
            te.rep_override = item["rep_override"]
            update_fields.append("rep_override")
        if "weight_override" in item and item["weight_override"] is not None:
            te.weight_override = item["weight_override"]
            update_fields.append("weight_override")
        if update_fields:
            te.save(update_fields=update_fields)
            updated += 1
    return updated
