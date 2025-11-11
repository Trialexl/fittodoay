from __future__ import annotations

from rest_framework import serializers

from .models import CustomExercise, Exercise


class ExerciseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Exercise
        fields = [
            "id",
            "name",
            "description",
            "target_muscles",
            "has_weight",
            "has_time",
            "default_weight",
            "default_time",
            "default_reps",
            "default_sets",
            "default_rest",
            "rating",
            "english_name",
            "difficulty",
            "common_errors",
        ]


class CustomExerciseSerializer(serializers.ModelSerializer):
    base_exercise = ExerciseSerializer(read_only=True)
    base_exercise_id = serializers.PrimaryKeyRelatedField(
        queryset=Exercise.objects.all(), write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = CustomExercise
        fields = [
            "id",
            "name",
            "description",
            "target_muscles",
            "has_weight",
            "has_time",
            "default_weight",
            "default_time",
            "default_reps",
            "default_sets",
            "default_rest",
            "base_exercise",
            "base_exercise_id",
        ]

    def create(self, validated_data):
        base_exercise = validated_data.pop("base_exercise_id", None)
        user = self.context["request"].user
        custom = CustomExercise.objects.create(
            user=user,
            base_exercise=base_exercise,
            **validated_data,
        )
        return custom

    def update(self, instance, validated_data):
        validated_data.pop("base_exercise_id", None)
        return super().update(instance, validated_data)
