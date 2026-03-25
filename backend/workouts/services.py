from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List

from django.db.models import Prefetch

from programs.models import DayTemplate, ProgramFolder, TemplateExercise
from workouts.models import ExerciseImage, ExerciseInstruction, ExerciseMuscle, WorkoutDay


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def template_matches_date(template: DayTemplate, target_date: date) -> bool:
    config = template.schedule_config or {}
    schedule_type = template.schedule_type

    if schedule_type == DayTemplate.ScheduleType.WEEKLY:
        days = config.get("days_of_week") or []
        if not days:
            return True
        return target_date.weekday() in days

    if schedule_type == DayTemplate.ScheduleType.BIWEEKLY:
        start = _parse_date(config.get("start_date")) or target_date
        interval = int(config.get("week_interval") or 2)
        days = config.get("days_of_week") or []
        weeks = (target_date - start).days // 7
        if weeks < 0:
            return False
        if weeks % interval != 0:
            return False
        return (not days) or target_date.weekday() in days

    if schedule_type == DayTemplate.ScheduleType.INTERVAL:
        start = _parse_date(config.get("start_date")) or target_date
        every_days = int(config.get("every_x_days") or 1)
        delta = (target_date - start).days
        return delta >= 0 and delta % every_days == 0

    if schedule_type == DayTemplate.ScheduleType.CUSTOM:
        specific = config.get("specific_dates") or []
        target_str = target_date.isoformat()
        return target_str in specific

    return True


def resolve_defaults(te: TemplateExercise) -> Dict[str, Any]:
    source = te.exercise or te.custom_exercise
    if source is None:
        return {}

    return {
        "has_weight": getattr(source, "has_weight", True),
        "has_time": getattr(source, "has_time", False),
        "weight": float(te.weight_override or getattr(source, "default_weight", 0) or 0),
        "reps": te.rep_override or getattr(source, "default_reps", None),
        "sets": te.set_override or getattr(source, "default_sets", 1),
        "time": te.time_override or getattr(source, "default_time", None),
        "rest": te.rest_override or getattr(source, "default_rest", 60),
    }


def _exercise_description(source: Any) -> str:
    prefetched = getattr(source, "prefetched_instructions", None)
    if prefetched is not None:
        ru_steps = [item.text_ru.strip() for item in prefetched if item.text_ru]
        if ru_steps:
            return " ".join(ru_steps).strip()
        en_steps = [item.text_en.strip() for item in prefetched if item.text_en]
        return " ".join(en_steps).strip()
    return getattr(source, "description", "") or ""


def _exercise_target_muscles(source: Any) -> str:
    prefetched = getattr(source, "prefetched_muscles", None)
    if prefetched is not None:
        return "/".join(
            filter(None, ((muscle.name_ru or muscle.name_en) for muscle in prefetched))
        )
    return getattr(source, "target_muscles", "") or ""


def _exercise_images(te: TemplateExercise) -> List[dict]:
    if not te.exercise_id:
        return []
    prefetched = getattr(te.exercise, "prefetched_images", None)
    if prefetched is not None:
        return [{"order": image.order, "path": image.path} for image in prefetched]
    return [
        {"order": image.order, "path": image.path}
        for image in te.exercise.images.order_by("order")
    ]


def _folder_display_name(folder: ProgramFolder) -> str:
    if folder.is_active:
        return folder.name
    return f"{folder.name} - не активен"


def _template_display_name(template: DayTemplate) -> str:
    if template.effective_active:
        return template.name
    return f"{template.name} - не активен"


def generate_daily_plan(user, target_date: date | None = None) -> WorkoutDay:
    target_date = target_date or date.today()
    day, _ = WorkoutDay.objects.get_or_create(user=user, date=target_date)

    prefetch_templates = Prefetch(
        "templates",
        queryset=DayTemplate.objects.prefetch_related(
            Prefetch(
                "template_exercises",
                queryset=TemplateExercise.objects.select_related(
                    "exercise", "custom_exercise", "custom_exercise__base_exercise"
                ).prefetch_related(
                    Prefetch(
                        "exercise__images",
                        queryset=ExerciseImage.objects.order_by("order"),
                        to_attr="prefetched_images",
                    ),
                    Prefetch(
                        "exercise__instructions",
                        queryset=ExerciseInstruction.objects.order_by("order"),
                        to_attr="prefetched_instructions",
                    ),
                    Prefetch(
                        "exercise__muscles",
                        queryset=ExerciseMuscle.objects.order_by("-is_primary", "name_ru", "name_en"),
                        to_attr="prefetched_muscles",
                    ),
                ),
            )
        ),
    )
    folders = list(
        ProgramFolder.objects.filter(user=user).prefetch_related(prefetch_templates)
    )
    folders.sort(key=lambda f: (f.name != "Основные", f.sort_order, f.id))

    plan_folders: List[dict] = []
    folder_ids: List[int] = []
    template_ids: List[int] = []
    total_sets = 0

    for folder in folders:
        if not folder.is_active:
            continue
        folder_payload = {"id": folder.id, "name": _folder_display_name(folder), "templates": []}
        for template in folder.templates.all():
            if not template.effective_active:
                continue
            if not template_matches_date(template, target_date):
                continue
            template_ids.append(template.id)
            exercises_payload = []
            for te in template.template_exercises.all():
                source = te.exercise or te.custom_exercise
                if source is None:
                    continue
                defaults = resolve_defaults(te)
                sets = []
                for idx in range(int(defaults.get("sets") or 1)):
                    sets.append(
                        {
                            "set_index": idx + 1,
                            "default_reps": defaults.get("reps"),
                            "default_weight": defaults.get("weight"),
                            "default_time": defaults.get("time"),
                            "rest": defaults.get("rest"),
                        }
                    )
                exercise_active = te.is_active
                if exercise_active:
                    total_sets += len(sets)
                images_payload = _exercise_images(te)
                difficulty = getattr(source, "difficulty", "") or ""
                if not difficulty:
                    base_exercise = getattr(source, "base_exercise", None)
                    if base_exercise is not None:
                        difficulty = getattr(base_exercise, "difficulty", "") or ""
                exercises_payload.append(
                    {
                        "template_exercise_id": te.id,
                        "source": {
                            "type": "system" if te.exercise else "custom",
                            "id": source.id,
                            "name": source.name,
                            "description": _exercise_description(source),
                            "target_muscles": _exercise_target_muscles(source),
                            "difficulty": difficulty,
                            "images": images_payload,
                        },
                        "defaults": defaults,
                        "note": te.note,
                        "is_active": exercise_active,
                        "sets": sets,
                    }
                )
            folder_payload["templates"].append(
                {
                    "id": template.id,
                    "name": _template_display_name(template),
                    "schedule_type": template.schedule_type,
                    "schedule_config": template.schedule_config,
                    "exercises": exercises_payload,
                }
            )
        if folder_payload["templates"]:
            plan_folders.append(folder_payload)
            folder_ids.append(folder.id)

    plan_snapshot = {
        "date": target_date.isoformat(),
        "folders": plan_folders,
        "total_sets": total_sets,
    }

    day.plan_snapshot = plan_snapshot
    day.source_folder_ids = folder_ids
    day.source_template_ids = template_ids
    day.save(update_fields=["plan_snapshot", "source_folder_ids", "source_template_ids"])
    return day


def update_workout_status(day: WorkoutDay):
    total_sets = day.plan_snapshot.get("total_sets") or 0
    if total_sets and day.set_logs.count() >= total_sets:
        if day.status != WorkoutDay.Status.COMPLETED:
            day.status = WorkoutDay.Status.COMPLETED
            day.save(update_fields=["status"])
    else:
        if day.status != WorkoutDay.Status.PENDING:
            day.status = WorkoutDay.Status.PENDING
            day.save(update_fields=["status"])
