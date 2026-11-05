"""Validate the entire plan before any database write."""

import math
from rest_framework import serializers
from workouts.models import Exercise_DB


class PlannedExerciseSerializer(serializers.Serializer):
    exercise_id = serializers.CharField(max_length=120)
    sets = serializers.IntegerField(min_value=1, max_value=20)
    reps = serializers.IntegerField(
        min_value=1, max_value=1000, allow_null=True, required=False
    )
    weight = serializers.FloatField(
        min_value=0, max_value=1000, allow_null=True, required=False
    )
    time = serializers.IntegerField(
        min_value=1, max_value=86400, allow_null=True, required=False
    )
    rest = serializers.IntegerField(
        min_value=0, max_value=3600, allow_null=True, required=False
    )
    note = serializers.CharField(max_length=255, allow_blank=True, required=False)

    def validate_weight(self, value):
        if value is not None and not math.isfinite(value):
            raise serializers.ValidationError("non_finite_weight")
        return value

    def validate(self, attrs):
        exercise = Exercise_DB.objects.filter(pk=attrs["exercise_id"]).first()
        if not exercise:
            raise serializers.ValidationError("unknown_exercise_id")
        if exercise.has_time and not attrs.get("time"):
            raise serializers.ValidationError("timed_exercise_requires_time")
        if not exercise.has_time and not attrs.get("reps"):
            raise serializers.ValidationError("exercise_requires_reps")
        if not exercise.has_time and attrs.get("time") is not None:
            raise serializers.ValidationError("exercise_does_not_use_time")
        if not exercise.has_weight and attrs.get("weight") not in (None, 0):
            raise serializers.ValidationError("exercise_does_not_use_weight")
        return attrs


class ScheduleSerializer(serializers.Serializer):
    days_of_week = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6),
        min_length=1,
        max_length=7,
    )

    def validate_days_of_week(self, days):
        if len(set(days)) != len(days):
            raise serializers.ValidationError("duplicate_weekday")
        return days


class PlannedDaySerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    comment = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    schedule_type = serializers.ChoiceField(choices=["weekly"])
    schedule_config = ScheduleSerializer()
    exercises = PlannedExerciseSerializer(many=True, min_length=1, max_length=8)


class PlannedProgramSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)
    comment = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    days = PlannedDaySerializer(many=True, min_length=1, max_length=5)


class ProgramPlanSerializer(serializers.Serializer):
    programs = PlannedProgramSerializer(many=True, min_length=1, max_length=1)
