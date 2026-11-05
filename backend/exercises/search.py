"""Shared, deterministic catalogue retrieval for the UI, MCP and LLM tools."""

from __future__ import annotations

import re
from dataclasses import dataclass
from django.db.models import Case, IntegerField, Value, When
from workouts.models import Exercise_DB

STOP = {
    "на",
    "в",
    "с",
    "со",
    "для",
    "по",
    "из",
    "и",
    "a",
    "the",
    "with",
    "on",
    "of",
    "to",
    "for",
    "найди",
    "покажи",
    "упражнение",
    "упражнения",
}
ROOTS = {
    "гантел": ("гантел", "dumbbell"),
    "штанг": ("штанг", "barbell"),
    "жим": ("жим", "press"),
    "тяга": ("тяга", "тяги", "тяг", "row"),
    "подтягив": ("подтягив", "pullup", "pull-up", "chin-up", "chinup"),
    "планк": ("планк", "plank"),
    "шраг": ("шраг", "shrug"),
    "наклон": ("наклон", "incline"),
    "скамь": ("скамь", "bench"),
    "рук": ("рук", "arm"),
    "одн": ("одн", "one", "single"),
    "лежа": ("лежа", "lying"),
    "подъем": ("подъем", "raise", "curl"),
}
MUSCLES = {
    "спина": ("спин", "широч", "поясниц", "back", "lat"),
    "широчайшие": ("широч", "lat"),
    "трапеции": ("трапец", "trap"),
    "плечи": ("плеч", "дельт", "shoulder", "delt"),
    "грудь": ("груд", "chest", "pector"),
    "бицепс": ("бицеп", "bicep"),
    "трицепс": ("трицеп", "tricep"),
    "пресс": ("пресс", "живот", "abdominal", "abs"),
    "ягодицы": ("ягод", "glute"),
    "квадрицепсы": ("квадриц", "quad"),
    "задняя поверхность бедра": ("задняя поверхность бедра", "hamstring"),
    "икроножные": ("икронож", "икры", "calves", "calf"),
    "ноги": (
        "бедр",
        "квадриц",
        "ягод",
        "икронож",
        "quad",
        "glute",
        "hamstring",
        "calves",
    ),
}
EQUIPMENT = {
    "dumbbell": ("гантел", "dumbbell"),
    "barbell": ("штанг", "barbell"),
    "body only": (
        "собственный вес",
        "собственным весом",
        "без оборудования",
        "body only",
        "bodyweight",
    ),
    "machine": ("тренажер", "machine"),
    "cable": ("блок", "cable"),
    "kettlebells": ("гир", "kettlebell"),
    "bands": ("резин", "эспандер", "band"),
}


def normalize(value: str) -> str:
    return re.sub(r"[^a-zа-я0-9]+", " ", value.casefold().replace("ё", "е")).strip()


def tokens(value: str) -> set[str]:
    result = set()
    for token in normalize(value).split():
        if token in STOP:
            continue
        root = next(
            (
                key
                for key, aliases in ROOTS.items()
                if any(token.startswith(normalize(a)) for a in aliases)
            ),
            None,
        )
        if root is None:
            root = (
                re.sub(
                    r"(иями|ами|ями|ого|ему|ому|ыми|ими|ий|ая|яя|ое|ее|ые|ие|ой|ей|их|ых|ам|ям|ах|ях|ом|ем|ов|ев|а|я|ы|и|у|ю|е|о|ь)$",
                    "",
                    token,
                )
                if len(token) > 4
                else token
            )
        result.add(root or token)
    return result


def equipment_key(value: str) -> str:
    normalized = normalize(value)
    return next(
        (
            key
            for key, aliases in EQUIPMENT.items()
            if any(normalize(a) in normalized for a in aliases)
        ),
        normalized,
    )


def muscle_matches(requested: str, actual: list[str]) -> bool:
    requested_norm = normalize(requested)
    aliases = next(
        (
            values
            for key, values in MUSCLES.items()
            if tokens(key) == tokens(requested_norm)
        ),
        None,
    )
    if aliases is None:
        candidates = [
            values
            for values in MUSCLES.values()
            if any(
                requested_norm.startswith(alias) or alias.startswith(requested_norm)
                for alias in values
            )
        ]
        aliases = min(candidates, key=len) if candidates else (requested_norm,)
    return any(alias in normalize(name) for name in actual for alias in aliases)


@dataclass
class SearchResult:
    exercises: list[Exercise_DB]
    total: int


def search_catalog(
    *,
    query: str = "",
    muscles: str = "",
    equipment: str = "",
    exclude_equipment: list[str] | None = None,
    primary_only: bool = False,
    limit: int | None = None,
    offset: int = 0,
) -> SearchResult:
    query_norm = normalize(query)
    query_tokens = tokens(query)
    equipment_norm = equipment_key(equipment) if equipment else ""
    excluded = {equipment_key(item) for item in (exclude_equipment or [])}
    matches = []
    for exercise in Exercise_DB.objects.all().prefetch_related("muscles"):
        records = list(exercise.muscles.all())
        muscle_names = [
            name
            for record in records
            if not primary_only or record.is_primary
            for name in (record.name_ru, record.name_en)
        ]
        if muscles and not muscle_matches(muscles, muscle_names):
            continue
        actual_equipment = equipment_key(exercise.equipment_en or exercise.equipment_ru)
        if equipment_norm and actual_equipment != equipment_norm:
            continue
        if actual_equipment in excluded:
            continue
        names = [exercise.name_ru, exercise.name_en, exercise.id]
        normalized_names = [normalize(name) for name in names]
        name_tokens = set().union(*(tokens(name) for name in names))
        exact = bool(query_norm and query_norm in normalized_names)
        # Every keyword is required. Semantic broadening may rank candidates, never drop explicit constraints.
        if (
            query_tokens
            and not exact
            and not all(
                any(
                    a == b
                    or (
                        min(len(a), len(b)) >= 4
                        and (a.startswith(b) or b.startswith(a))
                    )
                    for b in name_tokens
                )
                for a in query_tokens
            )
        ):
            continue
        score = (
            1000
            if exact
            else (
                100
                if query_norm and any(query_norm in name for name in normalized_names)
                else 0
            )
        )
        score -= len(name_tokens - query_tokens)
        if muscles and muscle_matches(
            muscles,
            [
                name
                for record in records
                if record.is_primary
                for name in (record.name_ru, record.name_en)
            ],
        ):
            score += 20
        matches.append((score, exercise))
    matches.sort(
        key=lambda item: (
            -item[0],
            normalize(item[1].name_ru or item[1].name_en),
            item[1].id,
        )
    )
    total = len(matches)
    rows = matches[offset : offset + limit] if limit is not None else matches[offset:]
    return SearchResult([item[1] for item in rows], total)


def ranked_queryset(result: SearchResult):
    ids = [exercise.pk for exercise in result.exercises]
    if not ids:
        return Exercise_DB.objects.none()
    order = Case(
        *(When(pk=pk, then=Value(index)) for index, pk in enumerate(ids)),
        output_field=IntegerField(),
    )
    return (
        Exercise_DB.objects.filter(pk__in=ids)
        .prefetch_related("muscles", "instructions")
        .order_by(order)
    )


def catalog_card(exercise: Exercise_DB, *, detail: bool = False) -> dict:
    records = list(exercise.muscles.all())
    data = {
        "id": exercise.id,
        "name": exercise.name_ru or exercise.name_en,
        "english_name": exercise.name_en,
        "primary_muscles": [
            item.name_ru or item.name_en for item in records if item.is_primary
        ],
        "secondary_muscles": [
            item.name_ru or item.name_en for item in records if not item.is_primary
        ],
        "equipment": exercise.equipment_en or exercise.equipment_ru,
        "difficulty": exercise.level_en or exercise.level_ru,
        "has_weight": exercise.has_weight,
        "has_time": exercise.has_time,
        "defaults": {
            "sets": exercise.default_sets,
            "reps": exercise.default_reps,
            "weight": (
                float(exercise.default_weight)
                if exercise.default_weight is not None
                else None
            ),
            "time": exercise.default_time,
            "rest": exercise.default_rest,
        },
    }
    declared = equipment_key(exercise.equipment_en or exercise.equipment_ru)
    named = {
        key
        for key, aliases in EQUIPMENT.items()
        if any(normalize(alias) in normalize(exercise.name_ru) for alias in aliases)
    }
    data["metadata_warnings"] = (
        ["equipment_name_conflict"] if named and declared not in named else []
    )
    if detail:
        data["description"] = exercise.description[:6000]
        data["common_errors"] = exercise.common_errors[:2000]
    return data


def allowed_equipment(user) -> set[str]:
    profile = getattr(user, "profile", None)
    text = normalize(profile.equipment) if profile else ""
    # Free-form descriptions such as "gym" cannot be converted into hard exclusions.
    if any(marker in text for marker in ("зал", "gym", "любое", "все оборудование")):
        return set()
    return {
        key
        for key, aliases in EQUIPMENT.items()
        if any(normalize(alias) in text for alias in aliases)
    }
