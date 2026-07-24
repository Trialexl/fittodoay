from __future__ import annotations

from rest_framework import serializers

from workouts.models import Exercise_DB

from .models import CustomExercise


class ExerciseSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    target_muscles = serializers.SerializerMethodField()
    english_name = serializers.SerializerMethodField()
    difficulty = serializers.SerializerMethodField()
    common_errors = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()

    class Meta:
        model = Exercise_DB
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
            "images",
        ]

    def get_name(self, obj):
        return obj.name

    def get_description(self, obj):
        return obj.description

    def get_target_muscles(self, obj):
        return obj.target_muscles

    def get_english_name(self, obj):
        return obj.english_name

    def get_difficulty(self, obj):
        return obj.difficulty

    def get_common_errors(self, obj):
        return obj.common_errors

    def get_images(self, obj):
        return [
            {"order": image.order, "path": image.path}
            for image in obj.images.order_by("order")
        ]


class CustomExerciseSerializer(serializers.ModelSerializer):
    base_exercise = ExerciseSerializer(read_only=True)
    base_exercise_id = serializers.PrimaryKeyRelatedField(
        queryset=Exercise_DB.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
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
