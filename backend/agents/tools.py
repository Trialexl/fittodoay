"""Read-only tools. No tool in this registry can mutate a program."""

from __future__ import annotations
from rest_framework import serializers
from exercises.search import catalog_card, search_catalog
from exercises.models import CustomExercise
from workouts.models import Exercise_DB
from accounts.models import UserProfile


class StrictArguments(serializers.Serializer):
    def to_internal_value(self, data):
        if not isinstance(data, dict) or set(data) - set(self.fields):
            raise serializers.ValidationError(
                {"non_field_errors": ["unknown_arguments"]}
            )
        return super().to_internal_value(data)


class SearchArguments(StrictArguments):
    query = serializers.CharField(
        required=False, default="", allow_blank=True, max_length=200
    )
    muscles = serializers.CharField(
        required=False, default="", allow_blank=True, max_length=120
    )
    equipment = serializers.CharField(
        required=False, default="", allow_blank=True, max_length=80
    )
    exclude_equipment = serializers.ListField(
        child=serializers.CharField(max_length=80),
        required=False,
        default=list,
        max_length=10,
    )
    primary_only = serializers.BooleanField(required=False, default=False)
    limit = serializers.IntegerField(
        required=False, default=15, min_value=1, max_value=30
    )
    offset = serializers.IntegerField(
        required=False, default=0, min_value=0, max_value=1000
    )


class ExerciseArguments(StrictArguments):
    exercise_id = serializers.CharField(max_length=120)


class EmptyArguments(StrictArguments):
    pass


def definition(name, description, properties, required=()):
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": list(required),
                "additionalProperties": False,
            },
        },
    }


TOOL_DEFINITIONS = [
    definition(
        "search_exercises",
        "Поиск реального каталога. query — только ключевые слова движения. Явно заданные мышцы и оборудование передавай отдельными обязательными фильтрами. По умолчанию учитываются основные И вспомогательные мышцы (primary_only=false). primary_only=true используй только при явном требовании искать исключительно основные мышцы. В ответе объясняй роль найденной мышцы. При нуле результатов уточни слова, но не убирай ограничения пользователя молча. total и offset позволяют получить следующую страницу.",
        {
            "query": {"type": "string"},
            "muscles": {"type": "string"},
            "equipment": {"type": "string"},
            "exclude_equipment": {"type": "array", "items": {"type": "string"}},
            "primary_only": {"type": "boolean", "default": False},
            "limit": {"type": "integer", "minimum": 1, "maximum": 30},
            "offset": {"type": "integer", "minimum": 0, "maximum": 1000},
        },
    ),
    definition(
        "get_exercise",
        "Точная карточка упражнения по ID: назначение, оборудование, техника, параметры.",
        {"exercise_id": {"type": "string"}},
        ("exercise_id",),
    ),
    definition(
        "get_profile",
        "Фитнес-профиль без идентификаторов: цель, опыт, оборудование, ограничения и пожелания.",
        {},
    ),
    definition(
        "get_program",
        "Текущее состояние обсуждаемой программы с точными ID дней/упражнений и фактическими параметрами.",
        {},
    ),
    definition(
        "list_custom_exercises",
        "Собственные упражнения текущего пользователя (отдельные custom_exercise_id, не ID каталога).",
        {},
    ),
]


class ProgramReadTools:
    def __init__(self, user, program_reader=None):
        self.user = user
        self.program_reader = program_reader
        self.seen_ids = set()

    @property
    def definitions(self):
        return [
            item
            for item in TOOL_DEFINITIONS
            if self.program_reader or item["function"]["name"] != "get_program"
        ]

    def execute(self, name, arguments):
        if not isinstance(name, str):
            return {"error": "unknown_tool"}
        arguments_type = {
            "search_exercises": SearchArguments,
            "get_exercise": ExerciseArguments,
            "get_profile": EmptyArguments,
            "get_program": EmptyArguments,
            "list_custom_exercises": EmptyArguments,
        }.get(name)
        if arguments_type is None:
            return {"error": "unknown_tool"}
        validator = arguments_type(data=arguments)
        if not validator.is_valid():
            return {"error": "invalid_arguments", "details": validator.errors}
        values = validator.validated_data
        if name == "search_exercises":
            result = search_catalog(**values)
            self.seen_ids.update(item.pk for item in result.exercises)
            return {
                "total": result.total,
                "offset": values["offset"],
                "filters": values,
                "results": [catalog_card(item) for item in result.exercises],
            }
        if name == "get_exercise":
            exercise = (
                Exercise_DB.objects.prefetch_related("muscles", "instructions")
                .filter(pk=values["exercise_id"])
                .first()
            )
            if not exercise:
                return {"error": "exercise_not_found"}
            self.seen_ids.add(exercise.pk)
            return catalog_card(exercise, detail=True)
        if name == "get_profile":
            profile = UserProfile.objects.filter(user=self.user).first()
            if not profile:
                return {"error": "profile_not_found"}
            result = {
                key: getattr(profile, key)
                for key in (
                    "goal",
                    "gender",
                    "age",
                    "level",
                    "equipment",
                    "health_limitations",
                    "preferred_schedule_notes",
                )
            }
            result.update(
                {
                    key: float(getattr(profile, key))
                    for key in ("weight_kg", "height_cm")
                }
            )
            preferences = profile.llm_preferences or {}
            result["preferences"] = {
                key: preferences.get(key)
                for key in ("sessions_per_week", "session_duration", "notes")
            }
            return result
        if name == "get_program":
            return (
                self.program_reader()
                if self.program_reader
                else {"error": "program_not_available"}
            )
        return {
            "results": [
                {
                    "custom_exercise_id": item.pk,
                    "name": item.name,
                    "target_muscles": item.target_muscles,
                    "has_weight": item.has_weight,
                    "has_time": item.has_time,
                }
                for item in CustomExercise.objects.filter(user=self.user).order_by(
                    "pk"
                )[:100]
            ]
        }
