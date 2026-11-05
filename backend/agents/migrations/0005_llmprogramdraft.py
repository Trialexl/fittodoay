import uuid
import agents.models
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("agents", "0004_llmprogrammessage_proposal_status"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name="LLMProgramDraft",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("plan", models.JSONField()),
                ("profile_snapshot", models.JSONField(default=dict)),
                (
                    "expires_at",
                    models.DateTimeField(default=agents.models.draft_expiration),
                ),
                ("applied_result", models.JSONField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="llm_program_drafts",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        )
    ]
