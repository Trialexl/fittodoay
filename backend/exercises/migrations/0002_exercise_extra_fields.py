from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("exercises", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="exercise",
            name="common_errors",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="exercise",
            name="difficulty",
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        migrations.AddField(
            model_name="exercise",
            name="english_name",
            field=models.CharField(blank=True, max_length=150, null=True),
        ),
        migrations.AddField(
            model_name="exercise",
            name="rating",
            field=models.DecimalField(blank=True, decimal_places=1, help_text="Рейтинг 0-5", max_digits=3, null=True),
        ),
    ]
