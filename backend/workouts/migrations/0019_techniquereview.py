from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import migrations, models
import django.db.models.deletion
import workouts.models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("workouts", "0018_workoutmusictrack_album"),
    ]

    operations = [
        migrations.CreateModel(
            name="TechniqueReview",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("detected_exercise_name", models.CharField(blank=True, default="", max_length=255)),
                ("detected_exercise_confidence", models.FloatField(blank=True, null=True)),
                (
                    "video_file",
                    models.FileField(
                        upload_to=workouts.models.technique_video_upload_to,
                        validators=[
                            FileExtensionValidator(allowed_extensions=["mp4", "mov", "webm", "m4v"])
                        ],
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("processing", "Обрабатывается"),
                            ("needs_confirmation", "Требует подтверждения"),
                            ("completed", "Готово"),
                            ("failed", "Ошибка"),
                        ],
                        default="processing",
                        max_length=32,
                    ),
                ),
                ("score", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("result_json", models.JSONField(blank=True, default=dict)),
                ("summary", models.TextField(blank=True, default="")),
                ("error_code", models.CharField(blank=True, default="", max_length=64)),
                (
                    "exercise",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="technique_reviews",
                        to="workouts.exercise_db",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="technique_reviews",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["user", "-created_at"], name="workouts_te_user_id_016b85_idx"),
                    models.Index(fields=["status", "-created_at"], name="workouts_te_status_40f684_idx"),
                ],
            },
        ),
    ]
