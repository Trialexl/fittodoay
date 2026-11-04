"""Observable workout facts and a conservative, deterministic progression policy.

No LLM output enters this module. Missing sets/effort scores are never inferred.
"""

from __future__ import annotations

import json
from datetime import date
from dataclasses import asdict, dataclass
from typing import Any

from programs.models import TemplateExercise
from workouts.models import WorkoutDay, WorkoutSetLog
from workouts.services import resolve_defaults

VERSION = "progression-v1"
BREAK_DAYS = 14
REP_MIN = 8
REP_MAX = 12
WEIGHT_STEP = 2.0


@dataclass(frozen=True)
class ExerciseSession:
    date: str
    reps: tuple[int | None, ...]
    weight: tuple[float | None, ...]
    set_indices: tuple[int, ...]
    expected_indices: tuple[int, ...]
    planned_reps: int | None
    planned_weight: float | None
    source: dict
    plan_uniform: bool

    @property
    def complete(self):
        return bool(self.expected_indices) and self.set_indices == self.expected_indices


@dataclass(frozen=True)
class ExerciseAnalysisSnapshot:
    template_exercise_id: int
    exercise_name: str
    day_id: int
    folder_id: int
    has_weight: bool
    has_time: bool
    current_plan: dict
    current_session: ExerciseSession
    previous_sessions: tuple[ExerciseSession, ...]
    previous_similar_workout_date: str | None
    days_since_similar_workout: int | None
    plan_uniform: bool
    rir: None = None
    rpe: None = None
    pain: None = None


@dataclass(frozen=True)
class WorkoutAnalysisSnapshot:
    workout_day_id: int
    date: str
    program_id: int
    exercises: tuple[ExerciseAnalysisSnapshot, ...]

    def to_dict(self):
        return asdict(self)


def _entries(day, program_id):
    for folder in (day.plan_snapshot or {}).get("folders", []):
        if folder.get("id") != program_id:
            continue
        for template in folder.get("templates", []):
            for exercise in template.get("exercises", []):
                if exercise.get("is_active") is not False:
                    yield template, exercise


def _session(day, entry, logs):
    sets = sorted(entry.get("sets") or [], key=lambda item: item["set_index"])
    defaults = entry.get("defaults") or {}
    first = sets[0] if sets else {}
    return ExerciseSession(
        date=day.date.isoformat(),
        reps=tuple(log.actual_reps for log in logs),
        weight=tuple(
            float(log.actual_weight) if log.actual_weight is not None else None
            for log in logs
        ),
        set_indices=tuple(log.set_index for log in logs),
        expected_indices=tuple(item["set_index"] for item in sets),
        planned_reps=first.get("default_reps", defaults.get("reps")),
        planned_weight=first.get("default_weight", defaults.get("weight")),
        source={key: (entry.get("source") or {}).get(key) for key in ("id", "type")},
        plan_uniform=bool(sets)
        and all(
            item.get("default_reps", defaults.get("reps"))
            == first.get("default_reps", defaults.get("reps"))
            and item.get("default_weight", defaults.get("weight"))
            == first.get("default_weight", defaults.get("weight"))
            for item in sets
        ),
    )


def build_workout_snapshot(day: WorkoutDay, program_id: int) -> WorkoutAnalysisSnapshot:
    entries = list(_entries(day, program_id))
    templates = {
        te.id: te
        for te in TemplateExercise.objects.filter(
            id__in=[entry.get("template_exercise_id") for _, entry in entries],
            template__folder_id=program_id,
            template__folder__user_id=day.user_id,
            is_active=True,
        ).select_related("exercise", "custom_exercise", "template")
    }
    # Include incomplete sessions: they must break confirmation streaks, not vanish.
    days = [
        day,
        *WorkoutDay.objects.filter(user_id=day.user_id, date__lt=day.date)
        .filter(
            set_logs__template_exercise__template_id__in={
                te.template_id for te in templates.values()
            }
        )
        .distinct()
        .order_by("-date")
        .prefetch_related("set_logs"),
    ]
    sessions = {}
    similar_dates = {}
    for historical_day in days:
        logs_by_id = {}
        for log in historical_day.set_logs.all():
            logs_by_id.setdefault(log.template_exercise_id, []).append(log)
        for template, entry in _entries(historical_day, program_id):
            te_id = entry.get("template_exercise_id")
            logs = sorted(logs_by_id.get(te_id, []), key=lambda log: log.set_index)
            if historical_day.pk != day.pk and logs:
                similar_dates.setdefault(template["id"], historical_day.date)
            if te_id in templates and (historical_day.pk == day.pk or logs):
                sessions.setdefault(te_id, []).append(
                    _session(historical_day, entry, logs)
                )
    result = []
    for template, entry in entries:
        te_id = entry.get("template_exercise_id")
        te = templates.get(te_id)
        if not te or te.template_id != template.get("id"):
            continue
        source = te.exercise or te.custom_exercise
        if not source:
            continue
        source_identity = entry.get("source") or {}
        if source_identity and (
            str(source_identity.get("id")) != str(source.pk)
            or source_identity.get("type") != ("system" if te.exercise_id else "custom")
        ):
            continue  # Existing entry was replaced since this workout.
        current = sessions[te_id][0]
        previous = similar_dates.get(template["id"])
        defaults = entry.get("defaults") or {}
        sets = entry.get("sets") or []
        result.append(
            ExerciseAnalysisSnapshot(
                template_exercise_id=te_id,
                exercise_name=source.name,
                day_id=te.template_id,
                folder_id=program_id,
                has_weight=bool(defaults.get("has_weight", source.has_weight)),
                has_time=bool(defaults.get("has_time", source.has_time)),
                current_plan={
                    "weight": current.planned_weight,
                    "reps": current.planned_reps,
                    "sets": len(sets),
                },
                current_session=current,
                previous_sessions=tuple(sessions[te_id][1:4]),
                previous_similar_workout_date=(
                    previous.isoformat() if previous else None
                ),
                days_since_similar_workout=(
                    (day.date - previous).days if previous else None
                ),
                plan_uniform=current.plan_uniform,
            )
        )
    return WorkoutAnalysisSnapshot(
        day.pk, day.date.isoformat(), program_id, tuple(result)
    )


def decide(exercise: ExerciseAnalysisSnapshot) -> dict[str, Any]:
    current = exercise.current_session
    gap = exercise.days_since_similar_workout
    mode = (
        "RETURN_AFTER_BREAK"
        if gap is not None and gap >= BREAK_DAYS
        else "NORMAL_PROGRESSION"
    )
    decision = {
        "template_exercise_id": exercise.template_exercise_id,
        "exercise_name": exercise.exercise_name,
        "mode": mode,
        "decision": "hold",
        "reason_code": "maintain_load",
        "changes": {},
        "evidence": {
            "current_session": asdict(current),
            "previous_similar_workout_date": exercise.previous_similar_workout_date,
            "days_since_similar_workout": gap,
            "return_after_break": mode == "RETURN_AFTER_BREAK",
        },
    }

    def hold(reason, override_mode=None):
        decision["reason_code"] = reason
        if override_mode:
            decision["mode"] = override_mode
        return decision

    def change(field, value, reason):
        decision.update(
            decision="update_exercise",
            reason_code=reason,
            changes={field: {"from": exercise.current_plan[field], "to": value}},
        )
        return decision

    if exercise.pain is not None and exercise.pain > 0:
        return hold("reported_pain", "PAIN_LIMITED")
    if not current.complete:
        return hold("missing_sets_not_assessed", "INCOMPLETE_SESSION")
    if exercise.has_time or not exercise.plan_uniform or current.planned_reps is None:
        return hold("unsupported_plan")
    if not REP_MIN <= current.planned_reps <= REP_MAX:
        return hold("unsupported_rep_range")
    if any(rep is None for rep in current.reps) or (
        exercise.has_weight
        and (current.planned_weight is None or any(w is None for w in current.weight))
    ):
        return hold("missing_measurements", "INCOMPLETE_SESSION")
    # Match source IDs as well as entry IDs: replacing an exercise invalidates its history.
    history = []
    for session in exercise.previous_sessions:
        if session.source != current.source:
            break
        history.append(session)
    if not history or not any(session.complete for session in history):
        return hold("baseline_recorded", "FIRST_SESSION")
    minimum_reps = min(current.reps)
    if mode == "RETURN_AFTER_BREAK":
        if (
            exercise.has_weight
            and len(set(current.weight)) == 1
            and current.weight[0] > float(current.planned_weight)
            and minimum_reps >= current.planned_reps
        ):
            return change(
                "weight", current.weight[0], "align_plan_with_completed_session"
            )
        return hold("return_after_break")
    same_weight = not exercise.has_weight or all(
        w == float(current.planned_weight) for w in current.weight
    )
    previous = history[0]

    previous_gap = (
        date.fromisoformat(current.date) - date.fromisoformat(previous.date)
    ).days
    previous_was_return = (
        len(history) > 1
        and (
            date.fromisoformat(previous.date) - date.fromisoformat(history[1].date)
        ).days
        >= BREAK_DAYS
    )
    comparable = (
        not previous_was_return
        and previous.complete
        and previous.plan_uniform
        and previous_gap < BREAK_DAYS
        and previous.expected_indices == current.expected_indices
        and previous.planned_reps == current.planned_reps
        and previous.planned_weight == current.planned_weight
        and all(rep is not None for rep in previous.reps)
        and (
            not exercise.has_weight
            or all(w == float(current.planned_weight) for w in previous.weight)
        )
    )
    if (
        exercise.has_weight
        and same_weight
        and comparable
        and minimum_reps < REP_MIN
        and max(current.reps) < REP_MIN
        and max(previous.reps) < REP_MIN
    ):
        decision["mode"] = "REGRESSION"
        return change(
            "weight",
            max(0.0, float(current.planned_weight) - WEIGHT_STEP),
            "repeated_below_rep_range",
        )
    if exercise.has_weight and not same_weight:
        if (
            len(set(current.weight)) == 1
            and current.weight[0] > float(current.planned_weight)
            and minimum_reps >= current.planned_reps
        ):
            return change(
                "weight", current.weight[0], "align_plan_with_completed_session"
            )
        return hold("non_comparable_weight")
    if (
        exercise.has_weight
        and same_weight
        and minimum_reps >= REP_MAX
        and comparable
        and min(previous.reps) >= REP_MAX
    ):
        decision.update(
            decision="update_exercise",
            reason_code="confirmed_top_rep_range",
            changes={
                "weight": {
                    "from": current.planned_weight,
                    "to": float(current.planned_weight) + WEIGHT_STEP,
                },
                "reps": {"from": current.planned_reps, "to": REP_MIN},
            },
        )
        return decision
    if (
        same_weight
        and minimum_reps >= current.planned_reps
        and current.planned_reps < REP_MAX
    ):
        return change("reps", current.planned_reps + 1, "rep_target_completed")
    return hold("await_confirmation")


def analyze_workout(day, program_id):
    snapshot = build_workout_snapshot(day, program_id)
    decisions = [decide(exercise) for exercise in snapshot.exercises]
    actions = []
    for exercise, decision in zip(snapshot.exercises, decisions):
        changes = {
            key: value
            for key, value in decision["changes"].items()
            if value["from"] != value["to"]
        }
        if not changes:
            continue
        actions.append(
            {
                "type": "update_exercise",
                "template_exercise_id": exercise.template_exercise_id,
                "exercise_name": exercise.exercise_name,
                "day_id": exercise.day_id,
                "program_id": program_id,
                "workout_day_id": day.pk,
                "policy_version": VERSION,
                "changes": changes,
                "reason_code": decision["reason_code"],
                "evidence": decision["evidence"],
            }
        )
    return json.loads(
        json.dumps(
            {
                "version": VERSION,
                "snapshot": snapshot.to_dict(),
                "decisions": decisions,
                "actions": actions,
            }
        )
    )


def validate_policy_action(user, action, *, for_update=False):
    """Rebuild from DB at display/apply time; reject forged evidence and stale plans."""
    if not isinstance(action, dict) or any(
        not isinstance(action.get(key), int)
        or isinstance(action.get(key), bool)
        or action[key] <= 0
        for key in ("template_exercise_id", "workout_day_id", "program_id", "day_id")
    ):
        raise ValueError("invalid_policy_target")
    days = WorkoutDay.objects.select_for_update() if for_update else WorkoutDay.objects
    day = days.filter(pk=action.get("workout_day_id"), user=user).first()
    targets = (
        TemplateExercise.objects.select_for_update(of=("self",))
        if for_update
        else TemplateExercise.objects
    )
    te = (
        targets.filter(
            pk=action["template_exercise_id"],
            template__folder__user=user,
            template__folder_id=action.get("program_id"),
            template_id=action.get("day_id"),
            is_active=True,
        )
        .select_related("exercise", "custom_exercise")
        .first()
    )
    if not day or not te:
        raise ValueError("invalid_policy_target")
    if for_update:
        # Stabilize recorded evidence while applying the decision.
        list(
            WorkoutSetLog.objects.select_for_update(of=("self",))
            .filter(
                template_exercise=te,
                workout_day__user=user,
                workout_day__date__lte=day.date,
            )
            .order_by("pk")
        )
    report = analyze_workout(day, action["program_id"])
    if action not in report["actions"]:
        raise ValueError("policy_evidence_mismatch")
    defaults = resolve_defaults(te)
    exercise = next(
        item
        for item in report["snapshot"]["exercises"]
        if item["template_exercise_id"] == te.pk
    )
    for field, planned in exercise["current_plan"].items():
        if field == "weight" and not exercise["has_weight"]:
            continue
        if defaults.get(field) != planned:
            raise ValueError("stale_policy_plan")
    # A later actual workout makes the old recommendation obsolete.
    if WorkoutSetLog.objects.filter(
        workout_day__user=user,
        workout_day__date__gt=day.date,
        template_exercise__template_id=te.template_id,
    ).exists():
        raise ValueError("stale_policy_session")
    return te


def record_analysis(day, program_id, *, legacy=None):
    from django.conf import settings
    from workouts.models import WorkoutAnalysisRun

    report = analyze_workout(day, program_id)
    mode = getattr(settings, "WORKOUT_PROGRESSION_MODE", "shadow")
    WorkoutAnalysisRun.objects.update_or_create(
        workout_day=day,
        program_id=program_id,
        version=VERSION,
        defaults={
            "mode": mode,
            "report": report,
            "legacy_recommendations": legacy or [],
        },
    )
    return {**report, "rollout_mode": mode}
