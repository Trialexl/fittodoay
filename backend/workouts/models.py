from __future__ import annotations

import os
from pathlib import Path

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.core.validators import FileExtensionValidator
from django.db import models
from pgvector.django import VectorField

User = settings.AUTH_USER_MODEL
ALLOWED_MUSIC_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "aac", "webm"]


class MusicStorage(FileSystemStorage):
    @property
    def base_location(self):
        return str(Path(settings.MUSIC_ROOT))

    @property
    def location(self):
        return os.path.abspath(self.base_location)


music_storage = MusicStorage()


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Exercise_DB(TimestampedModel):
    """
    Базовая таблица с упражнениями из общего каталога.
    Названы в соответствии с исходным JSON (EN/RU).
    """

    id = models.CharField(primary_key=True, max_length=120)
    name_en = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255)
    force_en = models.CharField(max_length=64)
    force_ru = models.CharField(max_length=64)
    level_en = models.CharField(max_length=64)
    level_ru = models.CharField(max_length=64)
    mechanic_en = models.CharField(max_length=64, null=True, blank=True)
    mechanic_ru = models.CharField(max_length=64, null=True, blank=True)
    equipment_en = models.CharField(max_length=64)
    equipment_ru = models.CharField(max_length=64)
    category_en = models.CharField(max_length=64)
    category_ru = models.CharField(max_length=64)
    has_weight = models.BooleanField(default=True)
    has_time = models.BooleanField(default=False)
    default_sets = models.PositiveIntegerField(default=3)
    default_reps = models.PositiveIntegerField(default=10)
    default_rest = models.PositiveIntegerField(default=60, help_text="Отдых в секундах")
    embedding = VectorField(dimensions=384, null=True, blank=True)  # вектор для подбора похожих упражнений
    default_time = models.PositiveIntegerField(
        null=True, blank=True, help_text="Время в секундах"
    )
    default_weight = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True
    )
    rating = models.DecimalField(max_digits=3, decimal_places=1, null=True, blank=True)

    class Meta:
        verbose_name = "Упражнение"
        verbose_name_plural = "Упражнения"
        ordering = ["name_ru", "name_en"]

    def __str__(self):
        return self.name_ru or self.name_en

    @property
    def name(self) -> str:
        return self.name_ru or self.name_en

    @property
    def english_name(self) -> str | None:
        return self.name_en

    @property
    def difficulty(self) -> str | None:
        return self.level_ru or self.level_en

    @property
    def common_errors(self) -> str:
        return ""

    @property
    def description(self) -> str:
        ru_steps = list(self.instructions.order_by("order").values_list("text_ru", flat=True))
        if ru_steps:
            return " ".join(step.strip() for step in ru_steps if step).strip()
        en_steps = list(self.instructions.order_by("order").values_list("text_en", flat=True))
        return " ".join(step.strip() for step in en_steps if step).strip()

    @property
    def target_muscles(self) -> str:
        muscles = self.muscles.order_by("-is_primary", "name_ru", "name_en")
        parts = []
        for muscle in muscles:
            parts.append(muscle.name_ru or muscle.name_en)
        return "/".join(filter(None, parts))


class ExerciseMuscle(TimestampedModel):
    exercise = models.ForeignKey(
        Exercise_DB, on_delete=models.CASCADE, related_name="muscles"
    )
    name_en = models.CharField(max_length=128)
    name_ru = models.CharField(max_length=128)
    is_primary = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Мышца упражнения"
        verbose_name_plural = "Мышцы упражнений"
        indexes = [
            models.Index(fields=["is_primary", "name_en"]),
            models.Index(fields=["is_primary", "name_ru"]),
        ]
        unique_together = ("exercise", "name_en", "is_primary")
        ordering = ["exercise_id", "-is_primary", "name_en"]

    def __str__(self):
        return f"{self.exercise_id}: {self.name_ru}"


class ExerciseInstruction(TimestampedModel):
    exercise = models.ForeignKey(
        Exercise_DB, on_delete=models.CASCADE, related_name="instructions"
    )
    order = models.PositiveSmallIntegerField()
    text_en = models.TextField()
    text_ru = models.TextField()

    class Meta:
        verbose_name = "Инструкция упражнения"
        verbose_name_plural = "Инструкции упражнений"
        unique_together = ("exercise", "order")
        ordering = ["exercise_id", "order"]

    def __str__(self):
        return f"{self.exercise_id} — шаг {self.order}"


class ExerciseImage(TimestampedModel):
    exercise = models.ForeignKey(
        Exercise_DB, on_delete=models.CASCADE, related_name="images"
    )
    order = models.PositiveSmallIntegerField()
    path = models.CharField(max_length=255)

    class Meta:
        verbose_name = "Изображение упражнения"
        verbose_name_plural = "Изображения упражнений"
        unique_together = ("exercise", "order")
        ordering = ["exercise_id", "order"]

    def __str__(self):
        return f"{self.exercise_id}: {self.path}"


class WorkoutDay(TimestampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "В процессе"
        COMPLETED = "completed", "Завершено"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="workout_days")
    date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    source_folder_ids = models.JSONField(default=list, blank=True)
    source_template_ids = models.JSONField(default=list, blank=True)
    plan_snapshot = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ("user", "date")
        ordering = ["-date"]

    def __str__(self):
        return f"{self.user.email} — {self.date}"


class WorkoutSetLog(TimestampedModel):
    workout_day = models.ForeignKey(
        WorkoutDay, on_delete=models.CASCADE, related_name="set_logs"
    )
    template_exercise = models.ForeignKey(
        "programs.TemplateExercise", on_delete=models.SET_NULL, null=True, blank=True
    )
    set_index = models.PositiveIntegerField()
    actual_reps = models.PositiveIntegerField(null=True, blank=True)
    actual_weight = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    actual_time = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        unique_together = ("workout_day", "template_exercise", "set_index")
        ordering = ["workout_day", "template_exercise_id", "set_index"]

    def __str__(self):
        return f"{self.workout_day.date} Set {self.set_index}"


class WorkoutWeighIn(TimestampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="workout_weigh_ins")
    date = models.DateField()
    weight_kg = models.DecimalField(max_digits=5, decimal_places=2)
    note = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        unique_together = ("user", "date")
        ordering = ["-date", "-created_at"]

    def __str__(self):
        return f"{self.user} — {self.date} — {self.weight_kg} кг"


class WorkoutMusicTrack(TimestampedModel):
    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="music_tracks",
        null=True,
        blank=True,
        help_text="Пусто = системный трек для всех пользователей",
    )
    title = models.CharField(max_length=120, blank=True)
    file = models.FileField(
        upload_to="",
        storage=music_storage,
        validators=[FileExtensionValidator(allowed_extensions=ALLOWED_MUSIC_EXTENSIONS)],
        unique=True,
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Музыкальный трек"
        verbose_name_plural = "Музыкальные треки"
        ordering = ["title", "file", "-created_at"]

    def __str__(self):
        return self.display_name

    @property
    def display_name(self):
        if self.title:
            return self.title
        return Path(self.file.name).stem.replace("_", " ")

    def save(self, *args, **kwargs):
        if self.file and not self.title:
            self.title = Path(self.file.name).stem.replace("_", " ")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        stored_file = self.file
        super().delete(*args, **kwargs)
        if stored_file:
            try:
                stored_file.delete(save=False)
            except Exception:
                pass

# Create your models here.
