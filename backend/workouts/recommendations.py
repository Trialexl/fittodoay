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

TARGET_REP_MIN = 8
TARGET_REP_MAX = 12
TARGET_RIR = 2.0
RIR_TOLERANCE = 1.0
WEIGHT_STEP = Decimal("2.0")
AUTO_ALIGN_THRESHOLD = Decimal("0.5")
AUTO_DROP_THRESHOLD = Decimal("1.0")


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
    estimated_rir: Optional[float] = None
    informational: bool = False


def _average(values: List[float | None]) -> Optional[float]:
    filtered = [float(value) for value in values if value is not None]
    if not filtered:
        return None
    return sum(filtered) / len(filtered)


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(maximum, value))


def _round_weight_up(value: Decimal) -> float:
    rounded = value.to_integral_value(rounding="ROUND_HALF_UP")
    if rounded % 2:
        rounded += 1
    if rounded < value:
        rounded += 2
    return float(rounded)


def _estimate_rir(avg_reps: float) -> float:
    """
    Принимаем нижнюю границу диапазона (8 повторений) как RIR=0.
    Относительно неё считаем, сколько повторений остаётся «в запасе».
    """
    return avg_reps - TARGET_REP_MIN


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
                # Пропускаем деактивированные упражнения, чтобы не блокировать рекомендации
                if exercise.get("is_active") is False:
                    continue
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
    if defaults.get("has_time"):
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

    rounded_avg = round(avg_reps, 1)
    estimated_rir = _estimate_rir(rounded_avg)
    suggested_reps: Optional[int] = None
    suggested_weight: Optional[float] = None
    reason: Optional[str] = None
    action: Optional[str] = None
    informational = False

    rep_goal = _clamp(int(round(planned_reps)), TARGET_REP_MIN, TARGET_REP_MAX)
    actual_rep_goal = _clamp(int(round(rounded_avg)), TARGET_REP_MIN, TARGET_REP_MAX)
    source = te.exercise or te.custom_exercise
    exercise_name = source.name if source else f"Упражнение {te.id}"

    if has_weight and planned_weight is not None:
        planned_decimal = Decimal(str(planned_weight))
        actual_decimal = Decimal(str(avg_weight)) if avg_weight is not None else None
        if actual_decimal and actual_decimal > planned_decimal + AUTO_ALIGN_THRESHOLD:
            target_weight = _round_weight_up(actual_decimal)
            reason = (
                f"Фактически работаете со средним весом {target_weight} кг — фиксируем его и сохраняем диапазон повторений на уровне {actual_rep_goal}."
            )
            return Recommendation(
                template_exercise_id=te.id,
                exercise_name=exercise_name,
                template_name=te.template.name,
                folder_id=te.template.folder.id,
                folder_name=te.template.folder.name,
                current_reps=planned_reps,
                current_weight=float(planned_weight),
                average_reps=rounded_avg,
                average_weight=round(avg_weight, 2) if avg_weight is not None else None,
                suggested_reps=actual_rep_goal,
                suggested_weight=target_weight,
                has_weight=has_weight,
                reason=reason,
                action="align_weight",
                estimated_rir=round(estimated_rir, 1),
            )
        if actual_decimal and actual_decimal < planned_decimal - AUTO_DROP_THRESHOLD:
            new_weight = _round_weight_up(max(Decimal("0"), actual_decimal))
            reason = (
                f"Средний рабочий вес {actual_decimal} кг заметно ниже плана — возвращаемся к нему и удерживаем цель на уровне {actual_rep_goal} повторов."
            )
            return Recommendation(
                template_exercise_id=te.id,
                exercise_name=exercise_name,
                template_name=te.template.name,
                folder_id=te.template.folder.id,
                folder_name=te.template.folder.name,
                current_reps=planned_reps,
                current_weight=float(planned_weight),
                average_reps=rounded_avg,
                average_weight=round(avg_weight, 2) if avg_weight is not None else None,
                suggested_reps=actual_rep_goal,
                suggested_weight=new_weight,
                has_weight=has_weight,
                reason=reason,
                action="reduce_weight_to_actual",
                estimated_rir=round(estimated_rir, 1),
            )
        if rounded_avg < TARGET_REP_MIN - 0.5:
            new_weight = max(Decimal("0"), planned_decimal - WEIGHT_STEP)
            if new_weight != planned_decimal:
                suggested_weight = float(new_weight)
            suggested_reps = TARGET_REP_MIN
            reason = (
                f"Среднее {rounded_avg:.1f} повт. не дотягивает до 8 — уменьшаем вес и закрепляем план на 8 повторениях."
            )
            action = "decrease_weight"
        elif rounded_avg < TARGET_REP_MIN + 0.5 and planned_reps > TARGET_REP_MIN:
            reason = (
                f"Фактически удерживаете около {rounded_avg:.1f} повт. — сконцентрируйтесь на технике, после чего вернёмся к росту повторений."
            )
            action = "info_low_reps"
            informational = True
        elif rounded_avg >= TARGET_REP_MAX and estimated_rir > TARGET_RIR + RIR_TOLERANCE:
            suggested_weight = _round_weight_up(planned_decimal + WEIGHT_STEP)
            suggested_reps = TARGET_REP_MIN
            reason = (
                f"Повторы вышли на {rounded_avg:.1f} (RIR≈{estimated_rir:.1f}) — повышаем вес и начинаем новый цикл с 8 повторений."
            )
            action = "increase_weight"
        elif (avg_weight is None or abs(float(avg_weight) - planned_weight) <= float(AUTO_ALIGN_THRESHOLD)):
            if planned_reps < TARGET_REP_MAX and rounded_avg >= planned_reps:
                next_reps = min(planned_reps + 1, TARGET_REP_MAX)
                suggested_reps = next_reps
                reason = (
                    f"Вы уверенно держите {rounded_avg:.1f} повт. — повышаем целевой шаг до {next_reps}, "
                    "продолжайте наращивать повторы перед следующим ростом веса."
                )
                action = "increase_reps_after_weight"
        elif rep_goal != planned_reps:
            suggested_reps = rep_goal
            reason = "Фиксируем план в диапазоне 8–12 повт., чтобы отслеживать прогрессию."
            action = "adjust_reps"
    else:
        target_reps = _clamp(int(round(avg_reps)), TARGET_REP_MIN, TARGET_REP_MAX)
        if target_reps != planned_reps or (is_first_time and target_reps == planned_reps):
            suggested_reps = target_reps
            reason = (
                f"Средний результат {rounded_avg:.1f} повт. (RIR≈{estimated_rir:.1f}). "
                f"Обновите цель на {target_reps} повторов, чтобы держать диапазон 8–12."
            )
            action = "adjust_reps"

    if not informational and suggested_reps is None and suggested_weight is None:
        return None

    current_weight = float(planned_weight) if planned_weight is not None and has_weight else None

    return Recommendation(
        template_exercise_id=te.id,
        exercise_name=exercise_name,
        template_name=te.template.name,
        folder_id=te.template.folder.id,
        folder_name=te.template.folder.name,
        current_reps=planned_reps,
        current_weight=current_weight,
        average_reps=rounded_avg,
        average_weight=round(avg_weight, 2) if avg_weight is not None else None,
        suggested_reps=suggested_reps,
        suggested_weight=suggested_weight,
        has_weight=has_weight,
        reason=reason,
        action=action,
        estimated_rir=round(estimated_rir, 1),
        informational=informational,
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
                        "estimated_rir": recommendation.estimated_rir,
                        "informational": recommendation.informational,
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
