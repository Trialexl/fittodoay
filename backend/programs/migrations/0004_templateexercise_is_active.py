from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("programs", "0003_templateexercise_use_catalog"),
    ]

    operations = [
        migrations.AddField(
            model_name="templateexercise",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
    ]
