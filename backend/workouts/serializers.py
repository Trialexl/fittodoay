from __future__ import annotations

from datetime import date

from rest_framework import serializers

from workouts.models import WorkoutDay, WorkoutSetLog


class WorkoutSetLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkoutSetLog
        fields = [
            "id",
            "workout_day",
            "template_exercise",
            "set_index",
            "actual_reps",
            "actual_weight",
            "actual_time",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate(self, attrs):
        user = self.context["request"].user
        day = attrs.get("workout_day") or getattr(self.instance, "workout_day", None)
        if day is None:
            raise serializers.ValidationError("Не указан день тренировки")
        if day.user != user:
            raise serializers.ValidationError("Нельзя записывать подходы другого пользователя")
        template_exercise = attrs.get("template_exercise") or getattr(
            self.instance, "template_exercise", None
        )
        if template_exercise and template_exercise.template.folder.user != user:
            raise serializers.ValidationError("Нельзя логировать чужой шаблон")
        return attrs


class WorkoutDaySerializer(serializers.ModelSerializer):
    set_logs = WorkoutSetLogSerializer(many=True, read_only=True)

    class Meta:
        model = WorkoutDay
        fields = [
            "id",
            "date",
            "status",
            "plan_snapshot",
            "set_logs",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class WorkoutPlanRequestSerializer(serializers.Serializer):
    date = serializers.DateField(required=False)

    def get_date(self) -> date:
        if not self.is_valid():
            raise serializers.ValidationError(self.errors)
        return self.validated_data.get("date") or date.today()


class RecommendationItemSerializer(serializers.Serializer):
    template_exercise_id = serializers.IntegerField()
    rep_override = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    weight_override = serializers.DecimalField(
        required=False, allow_null=True, max_digits=6, decimal_places=2
    )

    def validate(self, attrs):
        if attrs.get("rep_override") is None and attrs.get("weight_override") is None:
            raise serializers.ValidationError("Укажите значение повторений или веса")
        return attrs


class RecommendationApplySerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
    items = RecommendationItemSerializer(many=True)
