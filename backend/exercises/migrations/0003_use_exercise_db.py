from django.db import migrations, models


def clear_base_exercises(apps, schema_editor):
    CustomExercise = apps.get_model("exercises", "CustomExercise")
    CustomExercise.objects.update(base_exercise=None)


class Migration(migrations.Migration):

    dependencies = [
        ("exercises", "0002_exercise_extra_fields"),
        ("workouts", "0002_exercise_db"),
        ("programs", "0003_templateexercise_use_catalog"),
    ]

    operations = [
        migrations.RunPython(clear_base_exercises, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="customexercise",
            name="base_exercise",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="custom_clones",
                to="workouts.exercise_db",
            ),
        ),
        migrations.DeleteModel(
            name="Exercise",
        ),
    ]
