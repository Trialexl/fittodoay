from __future__ import annotations

from django.conf import settings
from django.db import models

from programs.models import TemplateExercise

User = settings.AUTH_USER_MODEL


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


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
        TemplateExercise, on_delete=models.SET_NULL, null=True, blank=True
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

# Create your models here.
