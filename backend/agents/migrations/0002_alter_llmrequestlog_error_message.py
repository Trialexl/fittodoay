from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("agents", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="llmrequestlog",
            name="error_message",
            field=models.TextField(blank=True, null=True),
        ),
    ]
