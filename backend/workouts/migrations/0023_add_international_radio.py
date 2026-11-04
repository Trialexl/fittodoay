from django.db import migrations


# Official direct links: https://somafm.com/<channel>/directstreamlinks.html
RADIO_STREAMS = tuple(
    {
        "title": title,
        "artist": "SomaFM",
        "album": "Радио · Релакс" if category == "relax" else "Радио · Тренировка",
        "stream_category": category,
        "stream_url": f"https://ice5.somafm.com/{channel}-128-mp3",
    }
    for channel, title, category in (
        ("poptron", "PopTron", "workout"),
        ("dubstep", "Dub Step Beyond", "workout"),
        ("defcon", "DEF CON Radio", "workout"),
        ("beatblender", "Beat Blender", "relax"),
        ("groovesalad", "Groove Salad", "relax"),
    )
)


def add_radio_streams(apps, schema_editor):
    track_model = apps.get_model("workouts", "WorkoutMusicTrack")
    for station in RADIO_STREAMS:
        track_model.objects.get_or_create(
            owner_id=None,
            stream_url=station["stream_url"],
            defaults={**station, "file": None, "is_active": True},
        )


def remove_radio_streams(apps, schema_editor):
    apps.get_model("workouts", "WorkoutMusicTrack").objects.filter(
        owner_id__isnull=True,
        artist="SomaFM",
        stream_url__in=[station["stream_url"] for station in RADIO_STREAMS],
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("workouts", "0022_workoutanalysisrun")]
    operations = [migrations.RunPython(add_radio_streams, remove_radio_streams)]
