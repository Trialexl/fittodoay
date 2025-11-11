from __future__ import annotations

from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class TimestampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Exercise(TimestampedModel):
    """System exercise catalog entry."""

    name = models.CharField(max_length=150, unique=True)
    description = models.TextField(blank=True)
    target_muscles = models.CharField(max_length=120, help_text="Например: грудь/трицепс")
    has_weight = models.BooleanField(default=True)
    has_time = models.BooleanField(default=False)
    default_weight = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True
    )
    default_time = models.PositiveIntegerField(
        null=True, blank=True, help_text="Время в секундах"
    )
    default_reps = models.PositiveIntegerField(default=10)
    default_sets = models.PositiveIntegerField(default=3)
    default_rest = models.PositiveIntegerField(default=60, help_text="Отдых в секундах")
    rating = models.DecimalField(
        max_digits=3, decimal_places=1, null=True, blank=True, help_text="Рейтинг 0-5"
    )
    english_name = models.CharField(max_length=150, blank=True, null=True)
    difficulty = models.CharField(max_length=50, blank=True, null=True)
    common_errors = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class CustomExercise(TimestampedModel):
    """User-defined exercise copied from base template or created from scratch."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="custom_exercises")
    base_exercise = models.ForeignKey(
        Exercise, on_delete=models.SET_NULL, null=True, blank=True, related_name="custom_clones"
    )
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    target_muscles = models.CharField(max_length=120)
    has_weight = models.BooleanField(default=True)
    has_time = models.BooleanField(default=False)
    default_weight = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True
    )
    default_time = models.PositiveIntegerField(
        null=True, blank=True, help_text="Время в секундах"
    )
    default_reps = models.PositiveIntegerField(default=10)
    default_sets = models.PositiveIntegerField(default=3)
    default_rest = models.PositiveIntegerField(default=60)

    class Meta:
        unique_together = ("user", "name")
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.user.email})"

# Create your models here.
