from __future__ import annotations

from datetime import date
from decimal import Decimal

from rest_framework import serializers
from django.conf import settings

from workouts.models import WorkoutDay, WorkoutMusicTrack, WorkoutSetLog, WorkoutWeighIn

def _syncsafe_to_int(raw: bytes) -> int:
    if len(raw) != 4:
        return 0
    return ((raw[0] & 0x7F) << 21) | ((raw[1] & 0x7F) << 14) | ((raw[2] & 0x7F) << 7) | (raw[3] & 0x7F)


def _has_invalid_mp3_id3_header(value) -> bool:
    try:
        value.seek(0)
        head = value.read(10)
        total_size = int(getattr(value, "size", 0) or 0)
    except Exception:
        return False
    finally:
        try:
            value.seek(0)
        except Exception:
            pass

    if len(head) < 10 or head[:3] != b"ID3":
        return False
    tag_size = _syncsafe_to_int(head[6:10])
    return 10 + tag_size > total_size



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


class WorkoutWeighInSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkoutWeighIn
        fields = ["id", "date", "weight_kg", "note", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class WorkoutWeighInUpsertSerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
    weight_kg = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("20"),
        max_value=Decimal("400"),
    )
    note = serializers.CharField(required=False, allow_blank=True, max_length=255)

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


class WorkoutMusicTrackUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkoutMusicTrack
        fields = ["id", "artist", "album", "title", "file", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at", "is_active"]

    def validate_file(self, value):
        extension = value.name.rsplit(".", 1)[-1].lower() if "." in value.name else ""
        if extension != "mp3":
            raise serializers.ValidationError("Поддерживаются только MP3-файлы.")
        max_size_mb = max(int(getattr(settings, "MUSIC_UPLOAD_MAX_MB", 130)), 1)
        max_size = max_size_mb * 1024 * 1024
        if value.size > max_size:
            raise serializers.ValidationError(
                f"Файл слишком большой (максимум {max_size_mb}MB)."
            )
        if _has_invalid_mp3_id3_header(value):
            raise serializers.ValidationError("MP3-файл поврежден: некорректный ID3-заголовок.")
        return value
