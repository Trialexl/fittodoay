from django.db import migrations


RADIO_STREAMS = (
    {
        "title": "Workout",
        "artist": "Radio Record",
        "album": "Радио · Тренировка",
        "stream_category": "workout",
        "stream_url": "https://radiorecord.hostingradio.ru/workout96.aacp",
    },
    {
        "title": "EDM",
        "artist": "Radio Record",
        "album": "Радио · Тренировка",
        "stream_category": "workout",
        "stream_url": "https://radiorecord.hostingradio.ru/club96.aacp",
    },
    {
        "title": "Rock",
        "artist": "Radio Record",
        "album": "Радио · Тренировка",
        "stream_category": "workout",
        "stream_url": "https://radiorecord.hostingradio.ru/rock96.aacp",
    },
    {
        "title": "Phonk",
        "artist": "Radio Record",
        "album": "Радио · Тренировка",
        "stream_category": "workout",
        "stream_url": "https://radiorecord.hostingradio.ru/phonk96.aacp",
    },
    {
        "title": "Neurofunk",
        "artist": "Radio Record",
        "album": "Радио · Тренировка",
        "stream_category": "workout",
        "stream_url": "https://radiorecord.hostingradio.ru/neurofunk96.aacp",
    },
    {
        "title": "Hardstyle",
        "artist": "Radio Record",
        "album": "Радио · Тренировка",
        "stream_category": "workout",
        "stream_url": "https://radiorecord.hostingradio.ru/teo96.aacp",
    },
    {
        "title": "Nightride FM",
        "artist": "Nightride FM",
        "album": "Радио · Тренировка",
        "stream_category": "workout",
        "stream_url": "https://stream.nightride.fm/nightride.mp3",
    },
    {
        "title": "Darksynth",
        "artist": "Nightride FM",
        "album": "Радио · Тренировка",
        "stream_category": "workout",
        "stream_url": "https://stream.nightride.fm/darksynth.mp3",
    },
    {
        "title": "Datawave",
        "artist": "Nightride FM",
        "album": "Радио · Тренировка",
        "stream_category": "workout",
        "stream_url": "https://stream.nightride.fm/datawave.mp3",
    },
    {
        "title": "EBSM",
        "artist": "Nightride FM",
        "album": "Радио · Тренировка",
        "stream_category": "workout",
        "stream_url": "https://stream.nightride.fm/ebsm.mp3",
    },
    {
        "title": "Chill-Out",
        "artist": "Radio Record",
        "album": "Радио · Релакс",
        "stream_category": "relax",
        "stream_url": "https://radiorecord.hostingradio.ru/chil96.aacp",
    },
    {
        "title": "Chillsynth",
        "artist": "Nightride FM",
        "album": "Радио · Релакс",
        "stream_category": "relax",
        "stream_url": "https://stream.nightride.fm/chillsynth.mp3",
    },
)


def add_radio_streams(apps, schema_editor):
    track_model = apps.get_model("workouts", "WorkoutMusicTrack")
    for station in RADIO_STREAMS:
        stream_url = station["stream_url"]
        track_model.objects.update_or_create(
            stream_url=stream_url,
            defaults={
                **station,
                "owner_id": None,
                "file": None,
                "is_active": True,
            },
        )


def remove_radio_streams(apps, schema_editor):
    track_model = apps.get_model("workouts", "WorkoutMusicTrack")
    track_model.objects.filter(
        owner_id__isnull=True,
        stream_url__in=[station["stream_url"] for station in RADIO_STREAMS],
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("workouts", "0020_workoutmusictrack_streams"),
    ]

    operations = [
        migrations.RunPython(add_radio_streams, remove_radio_streams),
    ]
