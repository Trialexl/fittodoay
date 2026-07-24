from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Dict, List


from workouts.models import WorkoutSetLog, WorkoutWeighIn
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
        .order_by(
            "template_exercise__exercise__name_ru",
            "template_exercise__exercise__name_en",
            "template_exercise__custom_exercise__name",
        )
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


def aggregate_body_weight(user, start: date, end: date) -> List[Dict]:
    weigh_ins = (
        WorkoutWeighIn.objects.filter(user=user, date__range=(start, end))
        .order_by("date")
        .values("date", "weight_kg")
    )
    by_date = {entry["date"]: float(entry["weight_kg"]) for entry in weigh_ins}
    result = []
    cursor = start
    while cursor <= end:
        value = by_date.get(cursor)
        result.append(
            {
                "date": cursor.isoformat(),
                "weight_kg": round(value, 2) if value is not None else None,
            }
        )
        cursor += timedelta(days=1)
    return result


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
                "actual_weight": (
                    float(log.actual_weight) if log.actual_weight else None
                ),
                "actual_time": log.actual_time,
                "load": _compute_load(log),
            }
        )
    return feed


def _bucket_start(target: date, granularity: str) -> date:
    if granularity == "week":
        return target - timedelta(days=target.weekday())
    return target


def _bucket_sequence(start: date, end: date, granularity: str) -> List[date]:
    buckets: List[date] = []
    if granularity == "week":
        cursor = _bucket_start(start, "week")
        end_bucket = _bucket_start(end, "week")
        while cursor <= end_bucket:
            buckets.append(cursor)
            cursor += timedelta(days=7)
    else:
        cursor = start
        while cursor <= end:
            buckets.append(cursor)
            cursor += timedelta(days=1)
    return buckets


def build_program_trends(
    user, start: date, end: date, granularity: str = "day"
) -> tuple[List[Dict], date | None, date | None]:
    logs = (
        WorkoutSetLog.objects.filter(
            workout_day__user=user,
            workout_day__date__range=(start, end),
            template_exercise__isnull=False,
        )
        .select_related(
            "workout_day",
            "template_exercise__template__folder",
            "template_exercise__exercise",
            "template_exercise__custom_exercise",
        )
        .order_by("workout_day__date")
    )
    folder_names: Dict[int, str] = {}
    folder_daily: Dict[int, Dict[date, float]] = defaultdict(lambda: defaultdict(float))
    exercise_daily: Dict[tuple, Dict[date, float]] = defaultdict(
        lambda: defaultdict(float)
    )
    exercise_weight_sum: Dict[tuple, Dict[date, float]] = defaultdict(
        lambda: defaultdict(float)
    )
    exercise_weight_count: Dict[tuple, Dict[date, int]] = defaultdict(
        lambda: defaultdict(int)
    )
    exercise_meta: Dict[tuple, Dict] = {}

    for log in logs:
        te = log.template_exercise
        if not te:
            continue
        folder = te.template.folder
        folder_names[folder.id] = folder.name
        workout_date = _bucket_start(log.workout_day.date, granularity)
        load = _compute_load(log)
        folder_daily[folder.id][workout_date] += load
        source = te.exercise or te.custom_exercise
        source_name = source.name if source else "Упражнение"
        if te.exercise_id:
            group_key = (folder.id, "system", te.exercise_id)
        elif te.custom_exercise_id:
            group_key = (folder.id, "custom", te.custom_exercise_id)
        else:
            group_key = (folder.id, "template", te.id)
        if group_key not in exercise_meta:
            exercise_meta[group_key] = {
                "folder_id": folder.id,
                "exercise_name": source_name,
                "template_names": set([te.template.name]),
                "primary_te_id": te.id,
            }
        else:
            exercise_meta[group_key]["template_names"].add(te.template.name)
        exercise_daily[group_key][workout_date] += load
        if log.actual_weight is not None:
            exercise_weight_sum[group_key][workout_date] += float(log.actual_weight)
            exercise_weight_count[group_key][workout_date] += 1

    if not folder_names:
        return [], None, None

    dates: List[date] = _bucket_sequence(start, end, granularity)
    # Обрезаем диапазон до первой/последней даты, где есть хоть какая-то нагрузка
    active_dates = sorted(
        {
            dt
            for per_folder in folder_daily.values()
            for dt, load in per_folder.items()
            if load
        }
    )
    trimmed_start = active_dates[0] if active_dates else None
    trimmed_end = active_dates[-1] if active_dates else None
    if trimmed_start and trimmed_end:
        dates = [dt for dt in dates if trimmed_start <= dt <= trimmed_end]

    folders_payload: List[Dict] = []
    for folder_id, folder_name in folder_names.items():
        series = []
        for current in dates:
            value = folder_daily[folder_id].get(current)
            series.append(
                {
                    "date": current.isoformat(),
                    "load": None if value is None or value == 0 else round(value, 2),
                }
            )
        exercises_payload = []
        for group_key, meta in exercise_meta.items():
            if meta["folder_id"] != folder_id:
                continue
            points = []
            for current in dates:
                value = exercise_daily[group_key].get(current)
                weight_count = exercise_weight_count[group_key].get(current, 0)
                avg_weight = (
                    exercise_weight_sum[group_key][current] / weight_count
                    if weight_count > 0
                    else None
                )
                points.append(
                    {
                        "date": current.isoformat(),
                        "load": None if value is None else round(value, 2),
                        "avg_weight": (
                            None if avg_weight is None else round(avg_weight, 2)
                        ),
                        "weight_sets": weight_count,
                    }
                )
            if not any((point["load"] or 0) > 0 for point in points):
                continue
            template_label = ", ".join(sorted(meta["template_names"]))
            exercises_payload.append(
                {
                    "template_exercise_id": meta["primary_te_id"],
                    "exercise_name": meta["exercise_name"],
                    "template_name": template_label,
                    "series": points,
                }
            )
        exercises_payload.sort(
            key=lambda entry: sum(point["load"] or 0 for point in entry["series"]),
            reverse=True,
        )
        folders_payload.append(
            {
                "id": folder_id,
                "name": folder_name,
                "series": series,
                "exercises": exercises_payload,
            }
        )

    folders_payload.sort(key=lambda entry: entry["name"])
    return folders_payload, trimmed_start, trimmed_end
