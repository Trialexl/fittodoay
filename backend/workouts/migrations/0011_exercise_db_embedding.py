from django.db import migrations
import pgvector.django


class Migration(migrations.Migration):

    dependencies = [
        ("workouts", "0002_exercise_db"),
        ("analytics", "0002_enable_pgvector"),
    ]

    operations = [
        migrations.AddField(
            model_name="exercise_db",
            name="embedding",
            field=pgvector.django.VectorField(blank=True, dimensions=384, null=True),
        ),
    ]
