from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workouts", "0017_rename_workouts_ex_is_pri_743b6a_idx_workouts_ex_is_prim_8945b9_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="workoutmusictrack",
            name="album",
            field=models.CharField(blank=True, default="", max_length=160),
        ),
    ]

