from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from exercises.models import CustomExercise
from workouts.models import Exercise_DB

User = settings.AUTH_USER_MODEL


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ProgramFolder(TimestampedModel):
    """Folder that groups day templates under a goal/program."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="program_folders")
    name = models.CharField(max_length=120)
    comment = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        unique_together = ("user", "name")

    def __str__(self):
        return f"{self.name} ({self.user.email})"


class DayTemplate(TimestampedModel):
    """Scheduled day with ordered exercises."""

    class ScheduleType(models.TextChoices):
        WEEKLY = "weekly", "Еженедельно"
        BIWEEKLY = "biweekly", "Раз в N недель"
        INTERVAL = "interval", "Раз в X дней"
        CUSTOM = "custom", "Пользовательские правила"

    folder = models.ForeignKey(ProgramFolder, on_delete=models.CASCADE, related_name="templates")
    name = models.CharField(max_length=120)
    comment = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    schedule_type = models.CharField(max_length=20, choices=ScheduleType.choices)
    schedule_config = models.JSONField(default=dict, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        unique_together = ("folder", "name")

    def __str__(self):
        return f"{self.name} ({self.folder.name})"

    @property
    def effective_active(self) -> bool:
        return self.is_active and self.folder.is_active


class TemplateExercise(TimestampedModel):
    """Exercise entry inside a day template with optional overrides."""

    template = models.ForeignKey(
        DayTemplate, on_delete=models.CASCADE, related_name="template_exercises"
    )
    exercise = models.ForeignKey(
        Exercise_DB, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    custom_exercise = models.ForeignKey(
        CustomExercise, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    sort_order = models.PositiveIntegerField(default=0)
    weight_override = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    rep_override = models.PositiveIntegerField(null=True, blank=True)
    set_override = models.PositiveIntegerField(null=True, blank=True)
    time_override = models.PositiveIntegerField(null=True, blank=True, help_text="Секунды")
    rest_override = models.PositiveIntegerField(null=True, blank=True, help_text="Секунды")
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(exercise__isnull=False, custom_exercise__isnull=True)
                    | models.Q(exercise__isnull=True, custom_exercise__isnull=False)
                ),
                name="templateexercise_exactly_one_source",
            )
        ]

    def clean(self):
        super().clean()
        if bool(self.exercise) == bool(self.custom_exercise):
            raise ValidationError("Укажите либо системное упражнение, либо кастомное, но не оба.")

    def __str__(self):
        ref = self.exercise or self.custom_exercise
        return f"{self.template.name} → {ref}"

# Create your models here.
