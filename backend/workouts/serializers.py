from __future__ import annotations

from datetime import date
from decimal import Decimal
from pathlib import Path
import shutil
import subprocess
import tempfile

from rest_framework import serializers
from django.conf import settings

from workouts.models import (
    Exercise_DB,
    TechniqueReview,
    WorkoutDay,
    WorkoutMusicTrack,
    WorkoutSetLog,
    WorkoutWeighIn,
)


def _syncsafe_to_int(raw: bytes) -> int:
    if len(raw) != 4:
        return 0
    return (
        ((raw[0] & 0x7F) << 21)
        | ((raw[1] & 0x7F) << 14)
        | ((raw[2] & 0x7F) << 7)
        | (raw[3] & 0x7F)
    )


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


def _probe_video_duration_seconds(value) -> float | None:
    ffprobe_path = shutil.which("ffprobe")
    if not ffprobe_path:
        return None
    suffix = Path(getattr(value, "name", "") or "").suffix or ".mp4"
    try:
        value.seek(0)
        raw = value.read()
    except Exception:
        return None
    finally:
        try:
            value.seek(0)
        except Exception:
            pass
    if not raw:
        return None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix) as tmp_file:
            tmp_file.write(raw)
            tmp_file.flush()
            completed = subprocess.run(
                [
                    ffprobe_path,
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    tmp_file.name,
                ],
                check=False,
                capture_output=True,
                timeout=10,
            )
    except Exception:
        return None
    if completed.returncode != 0:
        return None
    try:
        return float(completed.stdout.decode("utf-8", errors="ignore").strip())
    except ValueError:
        return None


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
            raise serializers.ValidationError(
                "Нельзя записывать подходы другого пользователя"
            )
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


class TechniqueExerciseSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = Exercise_DB
        fields = ["id", "name", "name_en", "name_ru"]

    def get_name(self, obj):
        return obj.name


class TechniqueReviewSerializer(serializers.ModelSerializer):
    exercise = TechniqueExerciseSerializer(read_only=True)
    video_filename = serializers.SerializerMethodField()

    class Meta:
        model = TechniqueReview
        fields = [
            "id",
            "status",
            "exercise",
            "detected_exercise_name",
            "detected_exercise_confidence",
            "video_filename",
            "score",
            "result_json",
            "summary",
            "error_code",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_video_filename(self, obj):
        return obj.video_file.name.rsplit("/", 1)[-1] if obj.video_file else ""


class TechniqueReviewCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TechniqueReview
        fields = ["video_file"]

    def validate(self, attrs):
        value = attrs.get("video_file")
        if not value:
            return attrs
        max_size_mb = max(int(getattr(settings, "TECHNIQUE_VIDEO_MAX_MB", 80)), 1)
        max_size = max_size_mb * 1024 * 1024
        if value.size > max_size:
            raise serializers.ValidationError(
                {
                    "message": f"Видео слишком большое (максимум {max_size_mb}MB).",
                    "error_code": "video_too_large",
                }
            )
        max_seconds = max(int(getattr(settings, "TECHNIQUE_VIDEO_MAX_SECONDS", 30)), 1)
        duration_seconds = _probe_video_duration_seconds(value)
        if duration_seconds and duration_seconds > max_seconds:
            raise serializers.ValidationError(
                {
                    "message": f"Видео слишком длинное (максимум {max_seconds} секунд).",
                    "error_code": "video_too_long",
                }
            )
        return attrs

    def create(self, validated_data):
        return TechniqueReview.objects.create(
            user=self.context["request"].user,
            status=TechniqueReview.Status.PROCESSING,
            **validated_data,
        )


class TechniqueReviewConfirmExerciseSerializer(serializers.Serializer):
    exercise_id = serializers.PrimaryKeyRelatedField(queryset=Exercise_DB.objects.all())


class RecommendationItemSerializer(serializers.Serializer):
    template_exercise_id = serializers.IntegerField()
    rep_override = serializers.IntegerField(
        required=False, allow_null=True, min_value=1
    )
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
    file = serializers.FileField(required=True, allow_empty_file=False)

    class Meta:
        model = WorkoutMusicTrack
        fields = [
            "id",
            "artist",
            "album",
            "title",
            "file",
            "is_active",
            "created_at",
            "updated_at",
        ]
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
            raise serializers.ValidationError(
                "MP3-файл поврежден: некорректный ID3-заголовок."
            )
        return value
