from django.db import migrations, models


def clear_template_exercises(apps, schema_editor):
    TemplateExercise = apps.get_model("programs", "TemplateExercise")
    TemplateExercise.objects.update(exercise=None)


class Migration(migrations.Migration):

    dependencies = [
        ("programs", "0002_create_default_folders"),
        ("workouts", "0002_exercise_db"),
        ("exercises", "0002_exercise_extra_fields"),
    ]

    operations = [
        migrations.RunPython(clear_template_exercises, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="templateexercise",
            name="exercise",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="+",
                to="workouts.exercise_db",
            ),
        ),
    ]
