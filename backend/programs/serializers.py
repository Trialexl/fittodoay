from __future__ import annotations

from rest_framework import serializers

from exercises.models import CustomExercise
from exercises.serializers import CustomExerciseSerializer, ExerciseSerializer
from programs.models import DayTemplate, ProgramFolder, TemplateExercise
from workouts.models import Exercise_DB


class ProgramFolderSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProgramFolder
        fields = [
            "id",
            "name",
            "comment",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class TemplateExerciseSerializer(serializers.ModelSerializer):
    exercise = ExerciseSerializer(read_only=True)
    exercise_id = serializers.PrimaryKeyRelatedField(
        source="exercise",
        queryset=Exercise_DB.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    custom_exercise = CustomExerciseSerializer(read_only=True)
    custom_exercise_id = serializers.PrimaryKeyRelatedField(
        source="custom_exercise",
        queryset=CustomExercise.objects.none(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = TemplateExercise
        fields = [
            "id",
            "sort_order",
            "exercise",
            "exercise_id",
            "custom_exercise",
            "custom_exercise_id",
            "weight_override",
            "rep_override",
            "set_override",
            "time_override",
            "rest_override",
            "note",
            "is_active",
        ]

    def __init__(self, *args, **kwargs):
        self.request = kwargs.get("context", {}).get("request")
        super().__init__(*args, **kwargs)
        self.fields["exercise_id"].queryset = Exercise_DB.objects.all()
        custom_qs = CustomExercise.objects.none()
        if self.request and self.request.user.is_authenticated:
            custom_qs = CustomExercise.objects.filter(user=self.request.user)
        self.fields["custom_exercise_id"].queryset = custom_qs

    def validate(self, attrs):
        exercise = attrs.get("exercise")
        custom_exercise = attrs.get("custom_exercise")
        if exercise and custom_exercise:
            raise serializers.ValidationError(
                "Укажите только один источник упражнения."
            )
        if not exercise and not custom_exercise:
            raise serializers.ValidationError(
                "Выберите системное упражнение или кастомное."
            )
        return attrs


class DayTemplateSerializer(serializers.ModelSerializer):
    template_exercises = TemplateExerciseSerializer(many=True, required=False)

    class Meta:
        model = DayTemplate
        fields = [
            "id",
            "folder",
            "name",
            "comment",
            "is_active",
            "schedule_type",
            "schedule_config",
            "sort_order",
            "template_exercises",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def create(self, validated_data):
        exercises = validated_data.pop("template_exercises", [])
        template = DayTemplate.objects.create(**validated_data)
        self._sync_exercises(template, exercises)
        return template

    def update(self, instance, validated_data):
        exercises = validated_data.pop("template_exercises", None)
        instance = super().update(instance, validated_data)
        if exercises is not None:
            instance.template_exercises.all().delete()
            self._sync_exercises(instance, exercises)
        return instance

    def _sync_exercises(self, template: DayTemplate, exercises_payload: list[dict]):
        for payload in exercises_payload:
            TemplateExercise.objects.create(template=template, **payload)
