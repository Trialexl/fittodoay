from __future__ import annotations

from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="LLMRequestLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("payload", models.JSONField()),
                ("response", models.JSONField(blank=True, null=True)),
                ("status", models.CharField(max_length=64)),
                ("success", models.BooleanField(default=False)),
                ("error_message", models.TextField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="llm_requests", to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
