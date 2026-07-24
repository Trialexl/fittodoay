from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
import json
from pathlib import Path
import shutil
import subprocess
from uuid import uuid4

import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile, TemporaryUploadedFile
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.test import override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from agents.models import LLMRequestLog
from programs.models import DayTemplate, ProgramFolder, TemplateExercise
from workouts.models import (
    Exercise_DB,
    ExerciseImage,
    ExerciseInstruction,
    ExerciseMuscle,
    TechniqueReview,
    WorkoutMusicTrack,
    WorkoutSetLog,
    WorkoutWeighIn,
)
from workouts.recommendations import generate_recommendations_for_day
from workouts.serializers import TechniqueReviewCreateSerializer
from workouts.services import generate_daily_plan, template_matches_date
from workouts.technique import TechniqueAnalysisError, TechniqueReviewAnalysisService

User = get_user_model()
TEST_DATE = date(2024, 6, 3)  # Monday


def _build_real_mp3(
    tmp_path: Path,
    *,
    filename: str,
    title: str,
    artist: str,
    album: str,
) -> bytes:
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        pytest.skip("ffmpeg is required for real mp3 tests")

    output_path = tmp_path / filename
    completed = subprocess.run(
        [
            ffmpeg_path,
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=880:duration=0.4",
            "-id3v2_version",
            "3",
            "-metadata",
            f"title={title}",
            "-metadata",
            f"artist={artist}",
            "-metadata",
            f"album={album}",
            "-codec:a",
            "libmp3lame",
            "-q:a",
            "6",
            str(output_path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stderr
    return output_path.read_bytes()


def _assert_mp3_decodes(file_path: Path) -> None:
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        pytest.skip("ffmpeg is required for real mp3 tests")

    completed = subprocess.run(
        [ffmpeg_path, "-v", "error", "-i", str(file_path), "-f", "null", "-"],
        check=False,
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, completed.stderr


def _build_exercise(
    *,
    has_weight: bool = True,
    has_time: bool = False,
    default_sets: int = 3,
    default_reps: int = 10,
    default_weight: float = 20,
) -> Exercise_DB:
    return Exercise_DB.objects.create(
        id=f"ex_{uuid4().hex[:8]}",
        name_en="Dumbbell Row",
        name_ru="Тяга гантели",
        force_en="pull",
        force_ru="",
        level_en="beginner",
        level_ru="начальный",
        mechanic_en="compound",
        mechanic_ru="",
        equipment_en="dumbbell",
        equipment_ru="гантели",
        category_en="strength",
        category_ru="Силовая",
        has_weight=has_weight,
        has_time=has_time,
        default_sets=default_sets,
        default_reps=default_reps,
        default_weight=default_weight if has_weight else None,
        default_time=45 if has_time else None,
    )


def _build_template_exercise(
    user,
    *,
    rep_override: int = 12,
    set_override: int = 3,
    weight_override: float | None = 24,
    has_weight: bool = True,
    has_time: bool = False,
) -> TemplateExercise:
    folder = ProgramFolder.objects.create(user=user, name=f"Основные {uuid4().hex[:6]}")
    template = DayTemplate.objects.create(
        folder=folder,
        name=f"День {uuid4().hex[:4]}",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0]},
    )
    exercise = _build_exercise(
        has_weight=has_weight,
        has_time=has_time,
        default_sets=set_override,
        default_reps=rep_override if rep_override else 10,
        default_weight=weight_override or 20,
    )
    return TemplateExercise.objects.create(
        template=template,
        exercise=exercise,
        set_override=set_override,
        rep_override=rep_override,
        weight_override=weight_override if has_weight else None,
    )


def _build_day_with_logs(
    user,
    *,
    rep_override: int = 12,
    set_override: int = 3,
    weight_override: float | None = 24,
    actual_reps: list[int | None] | None = None,
    actual_weights: list[float | None] | None = None,
    has_weight: bool = True,
    has_time: bool = False,
):
    te = _build_template_exercise(
        user,
        rep_override=rep_override,
        set_override=set_override,
        weight_override=weight_override,
        has_weight=has_weight,
        has_time=has_time,
    )
    day = generate_daily_plan(user, target_date=TEST_DATE)
    reps = actual_reps or [rep_override] * set_override
    weights = actual_weights or [weight_override] * set_override
    for idx in range(min(len(reps), len(weights))):
        WorkoutSetLog.objects.create(
            workout_day=day,
            template_exercise=te,
            set_index=idx + 1,
            actual_reps=reps[idx],
            actual_weight=(
                Decimal(str(weights[idx]))
                if has_weight and weights[idx] is not None
                else None
            ),
            actual_time=45 if has_time else None,
        )
    return day, te


def _first_recommendation(day):
    folders = generate_recommendations_for_day(day)
    assert folders, "Ожидали хотя бы одну папку с рекомендациями"
    assert folders[0]["recommendations"], "Ожидали хотя бы одну рекомендацию"
    return folders[0]["recommendations"][0]


def _build_query_count_fixture(user, exercise_count: int) -> None:
    folder = ProgramFolder.objects.create(user=user, name=f"Папка {uuid4().hex[:6]}")
    template = DayTemplate.objects.create(
        folder=folder,
        name=f"День {uuid4().hex[:4]}",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0]},
    )
    for idx in range(exercise_count):
        exercise = _build_exercise()
        ExerciseInstruction.objects.create(
            exercise=exercise,
            order=1,
            text_ru=f"Шаг {idx + 1}",
            text_en=f"Step {idx + 1}",
        )
        ExerciseMuscle.objects.create(
            exercise=exercise,
            name_en=f"back-{idx}",
            name_ru=f"Спина {idx}",
            is_primary=True,
        )
        ExerciseImage.objects.create(exercise=exercise, order=1, path=f"/img/{idx}.jpg")
        TemplateExercise.objects.create(template=template, exercise=exercise)


def _count_generate_daily_plan_queries(user) -> int:
    with CaptureQueriesContext(connection) as captured:
        generate_daily_plan(user, target_date=TEST_DATE)
    return len(captured)


@pytest.mark.django_db
def test_template_matches_weekly_day():
    folder = ProgramFolder.objects.create(
        user=User.objects.create_user("a@a.a"), name="Тестовая папка"
    )
    template = DayTemplate.objects.create(
        folder=folder,
        name="Monday",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0, 2]},
    )
    assert template_matches_date(template, date(2024, 6, 3))  # Monday
    assert not template_matches_date(template, date(2024, 6, 4))  # Tuesday


@pytest.mark.django_db
def test_generate_daily_plan_query_count_does_not_scale_with_exercise_metadata():
    user_one = User.objects.create_user(email="queries1@example.com", password="pass")
    user_many = User.objects.create_user(email="queries3@example.com", password="pass")
    _build_query_count_fixture(user_one, 1)
    _build_query_count_fixture(user_many, 3)

    single_exercise_queries = _count_generate_daily_plan_queries(user_one)
    three_exercise_queries = _count_generate_daily_plan_queries(user_many)

    assert three_exercise_queries <= single_exercise_queries + 2


@pytest.mark.django_db
def test_generate_daily_plan_prioritizes_primary_folder():
    user = User.objects.create_user(email="user@example.com", password="pass")
    primary = ProgramFolder.objects.get(user=user, name="Основные")
    primary.sort_order = 0
    primary.save(update_fields=["sort_order"])
    extra = ProgramFolder.objects.create(user=user, name="Доп", sort_order=1)
    template_primary = DayTemplate.objects.create(
        folder=primary,
        name="Понедельник Грудь",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0]},
    )
    template_extra = DayTemplate.objects.create(
        folder=extra,
        name="Йога",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0]},
    )
    exercise = Exercise_DB.objects.create(
        id="db_press",
        name_en="Dumbbell Press",
        name_ru="Жим гантелей",
        force_en="push",
        force_ru="",
        level_en="beginner",
        level_ru="начальный",
        mechanic_en="compound",
        mechanic_ru="",
        equipment_en="dumbbell",
        equipment_ru="гантели",
        category_en="strength",
        category_ru="Силовая",
        default_sets=3,
        default_reps=10,
        has_weight=True,
        default_weight=20,
    )
    TemplateExercise.objects.create(template=template_primary, exercise=exercise)
    TemplateExercise.objects.create(template=template_extra, exercise=exercise)
    day = generate_daily_plan(user, target_date=date(2024, 6, 3))
    folders = day.plan_snapshot["folders"]
    assert folders[0]["name"].startswith("Основные")
    assert len(folders[0]["templates"]) == 1


@pytest.mark.django_db
def test_recommendation_increase_weight_on_top_rep_range():
    user = User.objects.create_user(email="toprange@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=12,
        weight_override=24,
        actual_reps=[12, 12, 12],
        actual_weights=[24, 24, 24],
    )
    rec = _first_recommendation(day)

    assert rec["action"] == "increase_weight"
    assert rec["suggested_weight"] == 26.0
    assert rec["suggested_reps"] == 8


@pytest.mark.django_db
def test_recommendation_increase_reps_before_weight_cycle():
    user = User.objects.create_user(email="repscycle@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=10,
        weight_override=24,
        actual_reps=[10, 10, 10],
        actual_weights=[24, 24, 24],
    )
    rec = _first_recommendation(day)

    assert rec["action"] == "increase_reps_after_weight"
    assert rec["suggested_reps"] == 11
    assert rec["suggested_weight"] is None


@pytest.mark.django_db
def test_recommendation_align_weight_when_actual_is_higher():
    user = User.objects.create_user(email="align@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=12,
        weight_override=24,
        actual_reps=[12, 12, 12],
        actual_weights=[25, 25, 25],
    )
    rec = _first_recommendation(day)

    assert rec["action"] == "align_weight"
    assert rec["suggested_weight"] == 26.0
    assert rec["suggested_reps"] == 12


@pytest.mark.django_db
def test_recommendation_reduce_weight_to_actual_when_too_low():
    user = User.objects.create_user(email="reduce@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=10,
        weight_override=24,
        actual_reps=[10, 10, 10],
        actual_weights=[21, 21, 21],
    )
    rec = _first_recommendation(day)

    assert rec["action"] == "reduce_weight_to_actual"
    assert rec["suggested_weight"] == 22.0


@pytest.mark.django_db
def test_recommendation_informational_when_reps_near_lower_bound():
    user = User.objects.create_user(email="info@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=10,
        weight_override=24,
        actual_reps=[8, 8, 8],
        actual_weights=[24, 24, 24],
    )
    rec = _first_recommendation(day)

    assert rec["action"] == "info_low_reps"
    assert rec["informational"] is True
    assert rec["suggested_reps"] is None
    assert rec["suggested_weight"] is None


@pytest.mark.django_db
def test_recommendation_adjust_reps_when_plan_out_of_range():
    user = User.objects.create_user(email="adjust@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=15,
        weight_override=24,
        actual_reps=[10, 10, 10],
        actual_weights=[23.4, 23.4, 23.4],
    )
    rec = _first_recommendation(day)

    assert rec["action"] == "adjust_reps"
    assert rec["suggested_reps"] == 12


@pytest.mark.django_db
def test_weigh_in_upsert_and_get_for_date():
    user = User.objects.create_user(email="weighin@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.put(
        "/api/workouts/weigh-in/",
        {"date": TEST_DATE.isoformat(), "weight_kg": "83.4"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["weight_kg"] == "83.40"

    get_response = client.get(f"/api/workouts/weigh-in/?date={TEST_DATE.isoformat()}")
    assert get_response.status_code == 200
    assert get_response.data["weight_kg"] == "83.40"
    assert WorkoutWeighIn.objects.filter(user=user, date=TEST_DATE).count() == 1


@pytest.mark.django_db
def test_workout_plan_includes_weigh_in_payload():
    user = User.objects.create_user(email="planweigh@example.com", password="pass")
    WorkoutWeighIn.objects.create(user=user, date=TEST_DATE, weight_kg="79.20")
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.get(f"/api/workouts/plan/?date={TEST_DATE.isoformat()}")
    assert response.status_code == 200
    assert response.data["weigh_in"]["weight_kg"] == "79.20"


@pytest.mark.django_db
def test_recommendation_absent_for_incomplete_folder_sets():
    user = User.objects.create_user(email="incomplete@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=12,
        set_override=3,
        weight_override=24,
        actual_reps=[12, 12],
        actual_weights=[24, 24],
    )

    assert generate_recommendations_for_day(day) == []


@pytest.mark.django_db
def test_recommendation_skips_time_based_exercise():
    user = User.objects.create_user(email="timer@example.com", password="pass")
    day, _ = _build_day_with_logs(
        user,
        rep_override=10,
        set_override=3,
        weight_override=None,
        actual_reps=[None, None, None],
        actual_weights=[None, None, None],
        has_weight=False,
        has_time=True,
    )

    assert generate_recommendations_for_day(day) == []


@pytest.mark.django_db
def test_music_tracks_endpoint_lists_active_tracks(tmp_path):
    user = User.objects.create_user(email="musiclist@example.com", password="pass")
    other_user = User.objects.create_user(
        email="musicother@example.com", password="pass"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    with override_settings(MUSIC_ROOT=tmp_path):
        first = WorkoutMusicTrack.objects.create(
            title="Warmup",
            album="Manual Album",
            is_active=True,
            owner=user,
            file=SimpleUploadedFile(
                "warmup.mp3", b"fake-mp3", content_type="audio/mpeg"
            ),
        )
        global_track = WorkoutMusicTrack.objects.create(
            title="Global",
            is_active=True,
            owner=None,
            file=SimpleUploadedFile(
                "global.mp3", b"fake-mp3", content_type="audio/mpeg"
            ),
        )
        other_track = WorkoutMusicTrack.objects.create(
            title="Other user",
            is_active=True,
            owner=other_user,
            file=SimpleUploadedFile(
                "other.mp3", b"fake-mp3", content_type="audio/mpeg"
            ),
        )
        WorkoutMusicTrack.objects.create(
            title="Hidden",
            is_active=False,
            file=SimpleUploadedFile(
                "hidden.mp3", b"fake-mp3", content_type="audio/mpeg"
            ),
        )
        response = client.get("/api/workouts/music/tracks/")

    assert response.status_code == 200
    items = response.data["items"]
    assert len(items) == 3
    ids = {item["id"] for item in items}
    assert ids == {first.id, global_track.id, other_track.id}
    own_item = next(item for item in items if item["id"] == first.id)
    assert own_item["is_mine"] is True
    assert own_item["url"] == f"/api/workouts/music/tracks/{first.id}/file/"
    assert own_item["album"] == "Manual Album"


@pytest.mark.django_db
def test_music_track_file_endpoint_blocks_missing_or_inactive_track(tmp_path):
    user = User.objects.create_user(email="musicfile@example.com", password="pass")
    other_user = User.objects.create_user(
        email="musicfileother@example.com", password="pass"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    with override_settings(MUSIC_ROOT=tmp_path):
        track = WorkoutMusicTrack.objects.create(
            title="Rest",
            is_active=True,
            owner=user,
            file=SimpleUploadedFile("rest.mp3", b"fake-mp3", content_type="audio/mpeg"),
        )
        hidden = WorkoutMusicTrack.objects.create(
            title="Inactive",
            is_active=False,
            file=SimpleUploadedFile(
                "inactive.mp3", b"fake-mp3", content_type="audio/mpeg"
            ),
        )
        foreign = WorkoutMusicTrack.objects.create(
            title="Foreign",
            is_active=True,
            owner=other_user,
            file=SimpleUploadedFile(
                "foreign.mp3", b"fake-mp3", content_type="audio/mpeg"
            ),
        )

        ok = client.get(f"/api/workouts/music/tracks/{track.id}/file/")
        missing = client.get("/api/workouts/music/tracks/999999/file/")
        inactive = client.get(f"/api/workouts/music/tracks/{hidden.id}/file/")
        foreign_response = client.get(f"/api/workouts/music/tracks/{foreign.id}/file/")

    assert ok.status_code == 200
    assert ok["Accept-Ranges"] == "bytes"
    assert missing.status_code == 404
    assert inactive.status_code == 404
    assert foreign_response.status_code == 200


@pytest.mark.django_db
def test_music_track_file_endpoint_supports_http_range_streaming(tmp_path):
    user = User.objects.create_user(email="musicrange@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)
    payload = b"0123456789"
    with override_settings(MUSIC_ROOT=tmp_path):
        track = WorkoutMusicTrack.objects.create(
            title="Range",
            is_active=True,
            owner=user,
            file=SimpleUploadedFile("range.mp3", payload, content_type="audio/mpeg"),
        )
        response = client.get(
            f"/api/workouts/music/tracks/{track.id}/file/",
            HTTP_RANGE="bytes=2-5",
        )

    assert response.status_code == 206
    assert response["Accept-Ranges"] == "bytes"
    assert response["Content-Range"] == "bytes 2-5/10"
    assert response["Content-Length"] == "4"
    assert b"".join(response.streaming_content) == b"2345"


@pytest.mark.django_db
def test_music_track_file_endpoint_uses_explicit_audio_content_types(tmp_path):
    user = User.objects.create_user(
        email="musiccontenttype@example.com", password="pass"
    )
    client = APIClient()
    client.force_authenticate(user=user)

    cases = [
        ("sample.mp3", "audio/mpeg"),
        ("sample.wav", "audio/wav"),
        ("sample.ogg", "audio/ogg"),
        ("sample.m4a", "audio/mp4"),
        ("sample.aac", "audio/aac"),
        ("sample.webm", "audio/webm"),
    ]

    with override_settings(MUSIC_ROOT=tmp_path):
        for index, (filename, expected_type) in enumerate(cases, start=1):
            track = WorkoutMusicTrack.objects.create(
                title=f"Track {index}",
                is_active=True,
                owner=user,
                file=SimpleUploadedFile(
                    filename, b"fake-audio", content_type="application/octet-stream"
                ),
            )
            response = client.get(f"/api/workouts/music/tracks/{track.id}/file/")
            assert response.status_code == 200
            assert response["Content-Type"] == expected_type


@pytest.mark.django_db
def test_music_track_file_endpoint_returns_416_for_invalid_range(tmp_path):
    user = User.objects.create_user(
        email="musicrangeinvalid@example.com", password="pass"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    with override_settings(MUSIC_ROOT=tmp_path):
        track = WorkoutMusicTrack.objects.create(
            title="Range invalid",
            is_active=True,
            owner=user,
            file=SimpleUploadedFile(
                "range-invalid.mp3", b"0123456789", content_type="audio/mpeg"
            ),
        )
        response = client.get(
            f"/api/workouts/music/tracks/{track.id}/file/",
            HTTP_RANGE="bytes=999-1000",
        )

    assert response.status_code == 416
    assert response["Content-Range"] == "bytes */10"
    assert response["Accept-Ranges"] == "bytes"


@pytest.mark.django_db
def test_music_upload_endpoint_creates_user_track(tmp_path):
    user = User.objects.create_user(email="musicupload@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)

    with override_settings(MUSIC_ROOT=tmp_path):
        response = client.post(
            "/api/workouts/music/tracks/upload/",
            {
                "file": SimpleUploadedFile(
                    "mine.mp3", b"fake-mp3", content_type="audio/mpeg"
                ),
            },
            format="multipart",
        )

    assert response.status_code == 201
    assert len(response.data["items"]) == 1
    created_item = response.data["items"][0]
    created = WorkoutMusicTrack.objects.get(id=created_item["id"])
    assert created.owner_id == user.id
    assert created.title == "mine"
    assert created_item["is_mine"] is True
    assert created_item["album"] == ""
    assert created.file.name.startswith(f"user_{user.id}/mine-")


@pytest.mark.django_db
def test_music_upload_endpoint_rejects_non_mp3_files(tmp_path):
    user = User.objects.create_user(email="musicreject@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)

    with override_settings(MUSIC_ROOT=tmp_path):
        response = client.post(
            "/api/workouts/music/tracks/upload/",
            {
                "file": SimpleUploadedFile(
                    "snow.m4a", b"fake-m4a", content_type="audio/mp4"
                ),
            },
            format="multipart",
        )

    assert response.status_code == 400
    assert "Поддерживаются только MP3-файлы." in str(response.data)


@pytest.mark.django_db
def test_music_upload_endpoint_rejects_mp3_with_invalid_id3_header(tmp_path):
    user = User.objects.create_user(
        email="musicinvalidid3@example.com", password="pass"
    )
    client = APIClient()
    client.force_authenticate(user=user)

    payload = b"ID3\x03\x00\x00\x00\x00\x7f\x06" + b"broken"

    with override_settings(MUSIC_ROOT=tmp_path):
        response = client.post(
            "/api/workouts/music/tracks/upload/",
            {
                "file": SimpleUploadedFile(
                    "broken-id3.mp3", payload, content_type="audio/mpeg"
                ),
            },
            format="multipart",
        )

    assert response.status_code == 400
    assert "MP3-файл поврежден: некорректный ID3-заголовок." in str(response.data)


@pytest.mark.django_db
def test_music_upload_endpoint_accepts_multiple_files(tmp_path):
    user = User.objects.create_user(email="musicmulti@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)

    with override_settings(MUSIC_ROOT=tmp_path):
        response = client.post(
            "/api/workouts/music/tracks/upload/",
            {
                "files": [
                    SimpleUploadedFile(
                        "warmup.mp3", b"fake-mp3", content_type="audio/mpeg"
                    ),
                    SimpleUploadedFile(
                        "rest.mp3", b"fake-mp3", content_type="audio/mpeg"
                    ),
                ],
            },
            format="multipart",
        )

    assert response.status_code == 201
    assert len(response.data["items"]) == 2
    ids = [item["id"] for item in response.data["items"]]
    tracks = list(WorkoutMusicTrack.objects.filter(id__in=ids).order_by("id"))
    assert len(tracks) == 2
    assert all(track.owner_id == user.id for track in tracks)
    assert all(track.file.name.startswith(f"user_{user.id}/") for track in tracks)


@pytest.mark.django_db
def test_music_upload_endpoint_keeps_real_mp3_playable_after_single_upload(tmp_path):
    user = User.objects.create_user(email="musicreal@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)
    payload = _build_real_mp3(
        tmp_path,
        filename="single-source.mp3",
        title="Single Tone",
        artist="Test Artist",
        album="Test Album",
    )

    with override_settings(MUSIC_ROOT=tmp_path):
        response = client.post(
            "/api/workouts/music/tracks/upload/",
            {
                "file": SimpleUploadedFile(
                    "single.mp3", payload, content_type="audio/mpeg"
                ),
            },
            format="multipart",
        )
        assert response.status_code == 201
        created_item = response.data["items"][0]
        created = WorkoutMusicTrack.objects.get(id=created_item["id"])
        stored_path = tmp_path / created.file.name

    assert created_item["artist"] == "Test Artist"
    assert created_item["title"] == "Single Tone"
    assert created_item["album"] == "Test Album"
    _assert_mp3_decodes(stored_path)


@pytest.mark.django_db
def test_music_upload_endpoint_keeps_real_mp3_playable_for_folder_style_multi_upload(
    tmp_path,
):
    user = User.objects.create_user(email="musicfolder@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)
    warmup_payload = _build_real_mp3(
        tmp_path,
        filename="warmup-source.mp3",
        title="Warmup Tone",
        artist="Folder Artist",
        album="Folder Album",
    )
    cooldown_payload = _build_real_mp3(
        tmp_path,
        filename="cooldown-source.mp3",
        title="Cooldown Tone",
        artist="Folder Artist",
        album="Folder Album",
    )

    with override_settings(MUSIC_ROOT=tmp_path):
        response = client.post(
            "/api/workouts/music/tracks/upload/",
            {
                "files": [
                    SimpleUploadedFile(
                        "Morning Set/warmup.mp3",
                        warmup_payload,
                        content_type="audio/mpeg",
                    ),
                    SimpleUploadedFile(
                        "Morning Set/Cooldown/cooldown.mp3",
                        cooldown_payload,
                        content_type="audio/mpeg",
                    ),
                ],
            },
            format="multipart",
        )
        assert response.status_code == 201
        created_items = response.data["items"]
        tracks = list(
            WorkoutMusicTrack.objects.filter(
                id__in=[item["id"] for item in created_items]
            ).order_by("id")
        )

    assert len(created_items) == 2
    assert {item["title"] for item in created_items} == {"Warmup Tone", "Cooldown Tone"}
    assert all(track.owner_id == user.id for track in tracks)
    for track in tracks:
        _assert_mp3_decodes(tmp_path / track.file.name)


def _syncsafe(value: int) -> bytes:
    return bytes(
        [
            (value >> 21) & 0x7F,
            (value >> 14) & 0x7F,
            (value >> 7) & 0x7F,
            value & 0x7F,
        ]
    )


def _id3_text_frame(frame_id: str, value: str) -> bytes:
    payload = b"\x03" + value.encode("utf-8")
    return (
        frame_id.encode("ascii")
        + len(payload).to_bytes(4, "big")
        + b"\x00\x00"
        + payload
    )


def _build_mp3_with_large_apic(
    *, artist: str, title: str, album: str, apic_size: int = 700_000
) -> bytes:
    frames = [
        _id3_text_frame("TPE1", artist),
        _id3_text_frame("TIT2", title),
        _id3_text_frame("TALB", album),
    ]
    apic_payload = b"\x00image/jpeg\x00\x03\x00" + (
        b"\xff\xd8" + b"J" * max(apic_size - 2, 0)
    )
    frames.append(
        b"APIC" + len(apic_payload).to_bytes(4, "big") + b"\x00\x00" + apic_payload
    )
    tag = b"".join(frames)
    audio = (b"\xff\xfb\xe0d" + b"\x00" * 28 + b"Info" + b"\x00" * 64) * 16
    return b"ID3\x03\x00\x00" + _syncsafe(len(tag)) + tag + audio


@pytest.mark.django_db
def test_music_upload_endpoint_extracts_artist_and_title_from_id3v1(tmp_path):
    user = User.objects.create_user(email="musicmeta@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)

    artist = "Artist Name".ljust(30, "\x00").encode("latin-1")
    title = "Track Title".ljust(30, "\x00").encode("latin-1")
    album = "Album Name".ljust(30, "\x00").encode("latin-1")
    year = b"2024"
    comment = b"\x00" * 30
    genre = b"\x00"
    payload = b"\x00" * 256 + b"TAG" + title + artist + album + year + comment + genre

    with override_settings(MUSIC_ROOT=tmp_path):
        response = client.post(
            "/api/workouts/music/tracks/upload/",
            {
                "file": SimpleUploadedFile(
                    "meta.mp3", payload, content_type="audio/mpeg"
                ),
            },
            format="multipart",
        )

    assert response.status_code == 201
    created_item = response.data["items"][0]
    assert created_item["artist"] == "Artist Name"
    assert created_item["title"] == "Track Title"
    assert created_item["album"] == "Album Name"
    assert created_item["name"] == "Artist Name — Track Title"


@pytest.mark.django_db
def test_music_upload_endpoint_strips_oversized_id3v2_tag_but_keeps_audio_stream(
    tmp_path,
):
    user = User.objects.create_user(email="musiccover@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)

    payload = _build_mp3_with_large_apic(
        artist="Мельница", title="Бес Джиги", album="Химера"
    )

    with override_settings(MUSIC_ROOT=tmp_path):
        response = client.post(
            "/api/workouts/music/tracks/upload/",
            {
                "file": SimpleUploadedFile(
                    "cover-heavy.mp3", payload, content_type="audio/mpeg"
                ),
            },
            format="multipart",
        )
        assert response.status_code == 201
        created_item = response.data["items"][0]
        created = WorkoutMusicTrack.objects.get(id=created_item["id"])
        stored = (tmp_path / created.file.name).read_bytes()

    assert created_item["artist"] == "Мельница"
    assert created_item["title"] == "Бес Джиги"
    assert created_item["album"] == "Химера"
    assert stored.startswith(b"\xff\xfb")
    assert b"APIC" not in stored[:1024]
    assert len(stored) < len(payload)


@pytest.mark.django_db
def test_music_tracks_endpoint_backfills_missing_album_from_file_metadata(tmp_path):
    user = User.objects.create_user(email="musicbackfill@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)
    artist = "System Of A Down".ljust(30, "\x00").encode("latin-1")
    title = "Aerials".ljust(30, "\x00").encode("latin-1")
    album = "Toxicity".ljust(30, "\x00").encode("latin-1")
    year = b"2001"
    comment = b"\x00" * 30
    genre = b"\x00"
    payload = b"\x00" * 64 + b"TAG" + title + artist + album + year + comment + genre

    with override_settings(MUSIC_ROOT=tmp_path):
        track = WorkoutMusicTrack.objects.create(
            title="Aerials",
            artist="System Of A Down",
            album="",
            is_active=True,
            owner=user,
            file=SimpleUploadedFile("aerials.mp3", payload, content_type="audio/mpeg"),
        )
        response = client.get("/api/workouts/music/tracks/")
        track.refresh_from_db()

    assert response.status_code == 200
    item = next(row for row in response.data["items"] if row["id"] == track.id)
    assert item["album"] == "Toxicity"
    assert track.album == "Toxicity"


@pytest.mark.django_db
def test_music_track_delete_endpoint_removes_own_track_and_file(tmp_path):
    user = User.objects.create_user(email="musicdelete@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)
    with override_settings(MUSIC_ROOT=tmp_path):
        track = WorkoutMusicTrack.objects.create(
            title="Delete me",
            is_active=True,
            owner=user,
            file=SimpleUploadedFile(
                "delete.mp3", b"fake-mp3", content_type="audio/mpeg"
            ),
        )
        stored_path = tmp_path / track.file.name
        assert stored_path.exists()
        response = client.delete(f"/api/workouts/music/tracks/{track.id}/")

    assert response.status_code == 204
    assert not WorkoutMusicTrack.objects.filter(id=track.id).exists()
    assert not stored_path.exists()


@pytest.mark.django_db
def test_music_track_delete_endpoint_forbidden_for_foreign_and_system_track(tmp_path):
    user = User.objects.create_user(
        email="musicdeleteowner@example.com", password="pass"
    )
    other = User.objects.create_user(
        email="musicdeleteother@example.com", password="pass"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    with override_settings(MUSIC_ROOT=tmp_path):
        foreign = WorkoutMusicTrack.objects.create(
            title="Foreign",
            is_active=True,
            owner=other,
            file=SimpleUploadedFile(
                "foreign.mp3", b"fake-mp3", content_type="audio/mpeg"
            ),
        )
        system = WorkoutMusicTrack.objects.create(
            title="System",
            is_active=True,
            owner=None,
            file=SimpleUploadedFile(
                "system.mp3", b"fake-mp3", content_type="audio/mpeg"
            ),
        )
        foreign_resp = client.delete(f"/api/workouts/music/tracks/{foreign.id}/")
        system_resp = client.delete(f"/api/workouts/music/tracks/{system.id}/")

    assert foreign_resp.status_code == 404
    assert system_resp.status_code == 404


@pytest.mark.django_db
def test_music_track_file_endpoint_allows_token_query_auth(tmp_path):
    user = User.objects.create_user(
        email="musicquerytoken@example.com", password="pass"
    )
    token = Token.objects.create(user=user)
    client = APIClient()
    with override_settings(MUSIC_ROOT=tmp_path):
        track = WorkoutMusicTrack.objects.create(
            title="Query token",
            is_active=True,
            owner=user,
            file=SimpleUploadedFile(
                "query.mp3", b"fake-mp3", content_type="audio/mpeg"
            ),
        )
        response = client.get(
            f"/api/workouts/music/tracks/{track.id}/file/?token={token.key}"
        )
    assert response.status_code == 200


@pytest.mark.django_db
def test_technique_review_upload_creates_review_and_runs_analysis(
    monkeypatch, tmp_path
):
    user = User.objects.create_user(email="technique@example.com", password="pass")
    exercise = _build_exercise()
    client = APIClient()
    client.force_authenticate(user=user)

    def fake_analyze(self, *, forced_exercise=None):
        self.review.exercise = forced_exercise or exercise
        self.review.detected_exercise_name = exercise.name
        self.review.detected_exercise_confidence = 0.91
        self.review.status = TechniqueReview.Status.COMPLETED
        self.review.score = 78
        self.review.summary = (
            "Техника в целом стабильная, но стоит держать корпус ровнее."
        )
        self.review.result_json = {
            "detected_exercise": {
                "name": exercise.name,
                "catalog_exercise_id": exercise.id,
                "confidence": 0.91,
                "alternatives": [],
            },
            "issues": [],
            "positive_notes": ["Темп стабильный."],
            "next_set_focus": ["Контролируйте корпус."],
        }
        self.review.save()
        return self.review

    monkeypatch.setattr(
        "workouts.views.TechniqueReviewAnalysisService.analyze", fake_analyze
    )

    with override_settings(MEDIA_ROOT=tmp_path, TECHNIQUE_ANALYSIS_MODE="sync"):
        response = client.post(
            "/api/technique-reviews/",
            {
                "video": SimpleUploadedFile(
                    "squat.mp4", b"fake-video", content_type="video/mp4"
                )
            },
            format="multipart",
        )

    assert response.status_code == 201
    assert response.data["status"] == "completed"
    assert response.data["exercise"]["id"] == exercise.id
    assert response.data["score"] == 78
    assert TechniqueReview.objects.filter(user=user, exercise=exercise).count() == 1


@pytest.mark.django_db
def test_technique_review_confirm_exercise_reruns_analysis(monkeypatch, tmp_path):
    user = User.objects.create_user(
        email="technique-confirm@example.com", password="pass"
    )
    exercise = _build_exercise()
    with override_settings(MEDIA_ROOT=tmp_path):
        review = TechniqueReview.objects.create(
            user=user,
            status=TechniqueReview.Status.NEEDS_CONFIRMATION,
            video_file=SimpleUploadedFile(
                "unknown.mp4", b"fake-video", content_type="video/mp4"
            ),
        )
    client = APIClient()
    client.force_authenticate(user=user)

    def fake_analyze(self, *, forced_exercise=None):
        assert forced_exercise == exercise
        self.review.exercise = forced_exercise
        self.review.detected_exercise_name = forced_exercise.name
        self.review.detected_exercise_confidence = 1.0
        self.review.status = TechniqueReview.Status.COMPLETED
        self.review.summary = "Упражнение подтверждено, разбор готов."
        self.review.result_json = {"score": None, "issues": []}
        self.review.save()
        return self.review

    monkeypatch.setattr(
        "workouts.views.TechniqueReviewAnalysisService.analyze", fake_analyze
    )

    with override_settings(MEDIA_ROOT=tmp_path, TECHNIQUE_ANALYSIS_MODE="sync"):
        response = client.post(
            f"/api/technique-reviews/{review.id}/confirm-exercise/",
            {"exercise_id": exercise.id},
            format="json",
        )

    assert response.status_code == 200
    assert response.data["status"] == "completed"
    assert response.data["exercise"]["id"] == exercise.id
    review.refresh_from_db()
    assert review.exercise == exercise


@pytest.mark.django_db
def test_technique_review_extracts_frames_across_video_duration(monkeypatch, tmp_path):
    user = User.objects.create_user(
        email="technique-frame-sampling@example.com", password="pass"
    )
    with override_settings(MEDIA_ROOT=tmp_path):
        review = TechniqueReview.objects.create(
            user=user,
            status=TechniqueReview.Status.PROCESSING,
            video_file=SimpleUploadedFile(
                "long-setup.mp4", b"fake-video", content_type="video/mp4"
            ),
        )

        monkeypatch.setattr("workouts.technique.shutil.which", lambda name: name)
        seeks = []
        frame_size = 64 * 64
        phase_values = [30, 70, 130, 190, 130, 70]
        frame_values = [0, 12, 28, 54, 96, 145] + phase_values + phase_values
        raw_candidates = b"".join(bytes([value]) * frame_size for value in frame_values)

        def fake_run(args, **kwargs):
            if args[0] == "ffprobe":
                return subprocess.CompletedProcess(args, 0, b"6.0\n", b"")
            if args[-1] == "pipe:1":
                return subprocess.CompletedProcess(args, 0, raw_candidates, b"")
            seeks.append(float(args[args.index("-ss") + 1]))
            Path(args[-1]).write_bytes(b"fake-jpeg")
            return subprocess.CompletedProcess(args, 0, b"", b"")

        monkeypatch.setattr("workouts.technique.subprocess.run", fake_run)

        frames = TechniqueReviewAnalysisService(review)._extract_frames()

    assert len(frames) == 8
    assert seeks == pytest.approx(
        [2.2, 2.733, 3.267, 3.8, 4.2, 4.733, 5.267, 5.8],
        abs=0.001,
    )


@pytest.mark.django_db
def test_technique_review_rejects_video_without_repeated_reps(monkeypatch, tmp_path):
    user = User.objects.create_user(
        email="technique-no-reps@example.com", password="pass"
    )
    with override_settings(MEDIA_ROOT=tmp_path):
        review = TechniqueReview.objects.create(
            user=user,
            status=TechniqueReview.Status.PROCESSING,
            video_file=SimpleUploadedFile(
                "approach-only.mp4", b"fake-video", content_type="video/mp4"
            ),
        )

        monkeypatch.setattr("workouts.technique.shutil.which", lambda name: name)
        frame_size = 64 * 64
        frame_values = [index * 12 for index in range(18)]
        raw_candidates = b"".join(bytes([value]) * frame_size for value in frame_values)

        def fake_run(args, **kwargs):
            if args[0] == "ffprobe":
                return subprocess.CompletedProcess(args, 0, b"6.0\n", b"")
            if args[-1] == "pipe:1":
                return subprocess.CompletedProcess(args, 0, raw_candidates, b"")
            Path(args[-1]).write_bytes(b"fake-jpeg")
            return subprocess.CompletedProcess(args, 0, b"", b"")

        monkeypatch.setattr("workouts.technique.subprocess.run", fake_run)

        service = TechniqueReviewAnalysisService(review)
        with pytest.raises(TechniqueAnalysisError) as exc_info:
            service._extract_frames()

    assert exc_info.value.code == "insufficient_repetitions"


@pytest.mark.django_db
def test_technique_review_catalog_candidates_include_pullups(tmp_path):
    user = User.objects.create_user(
        email="technique-pullup-catalog@example.com", password="pass"
    )
    pullup = Exercise_DB.objects.create(
        id="Pullups",
        name_en="Pullups",
        name_ru="Подтягивания на перекладине",
        force_en="pull",
        force_ru="",
        level_en="intermediate",
        level_ru="средний",
        mechanic_en="compound",
        mechanic_ru="",
        equipment_en="body only",
        equipment_ru="собственный вес",
        category_en="strength",
        category_ru="Силовая",
    )
    Exercise_DB.objects.create(
        id="Bench_Press",
        name_en="Bench Press",
        name_ru="Жим лежа",
        force_en="push",
        force_ru="",
        level_en="beginner",
        level_ru="начальный",
        mechanic_en="compound",
        mechanic_ru="",
        equipment_en="barbell",
        equipment_ru="штанга",
        category_en="strength",
        category_ru="Силовая",
    )
    with override_settings(MEDIA_ROOT=tmp_path):
        review = TechniqueReview.objects.create(
            user=user,
            status=TechniqueReview.Status.PROCESSING,
            video_file=SimpleUploadedFile(
                "pullups.mp4", b"fake-video", content_type="video/mp4"
            ),
        )

    candidates = TechniqueReviewAnalysisService(review)._catalog_candidates()

    assert any(candidate["id"] == pullup.id for candidate in candidates)


@pytest.mark.django_db
def test_technique_review_sends_images_to_llm_and_logs_placeholders(
    monkeypatch, tmp_path
):
    user = User.objects.create_user(
        email="technique-vision-payload@example.com", password="pass"
    )
    with override_settings(MEDIA_ROOT=tmp_path):
        review = TechniqueReview.objects.create(
            user=user,
            status=TechniqueReview.Status.PROCESSING,
            video_file=SimpleUploadedFile(
                "vision.mp4", b"fake-video", content_type="video/mp4"
            ),
        )
    service = TechniqueReviewAnalysisService(review)
    frames = [
        {
            "mime_type": "image/jpeg",
            "data": "YWJj",
            "timestamp_seconds": 1.25,
        },
        {
            "mime_type": "image/jpeg",
            "data": "ZGVm",
            "timestamp_seconds": 2.5,
        },
    ]
    candidates = [
        {
            "id": "Pullups",
            "name": "Подтягивания на перекладине",
            "name_en": "Pullups",
            "name_ru": "Подтягивания на перекладине",
            "equipment": "собственный вес",
        }
    ]
    captured_payload = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "detected_exercise": {
                                        "name": "Подтягивания на перекладине",
                                        "catalog_exercise_id": "Pullups",
                                        "confidence": 0.9,
                                        "alternatives": [],
                                    },
                                    "score": 70,
                                    "summary": "Видео распознано.",
                                    "issues": [],
                                    "positive_notes": [],
                                    "next_set_focus": [],
                                    "camera_feedback": [],
                                }
                            )
                        }
                    }
                ]
            }

    def fake_post(url, *, json, headers, timeout):
        captured_payload["url"] = url
        captured_payload["json"] = json
        return FakeResponse()

    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("OPENROUTER_VISION_MODEL", "openai/gpt-4o-mini")
    monkeypatch.setattr("workouts.technique.httpx.post", fake_post)

    result = service._call_vision_llm(frames, candidates, forced_exercise=None)

    content = captured_payload["json"]["messages"][1]["content"]
    sent_images = [item for item in content if item["type"] == "image_url"]
    assert result["detected_exercise"]["catalog_exercise_id"] == "Pullups"
    assert len(sent_images) == 2
    assert sent_images[0]["image_url"]["url"].startswith("data:image/jpeg;base64,YWJj")

    log = LLMRequestLog.objects.filter(user=user, status="technique_ok").first()
    assert log is not None
    assert log.payload["model"] == "openai/gpt-4o-mini"
    assert log.payload["image_count"] == 2
    assert log.payload["selected_frame_timestamps_seconds"] == [1.25, 2.5]
    logged_content = log.payload["messages"][1]["content"]
    logged_images = [item for item in logged_content if item["type"] == "image_url"]
    assert logged_images == [
        {"type": "image_url", "image_url": {"url": "[base64-image]"}},
        {"type": "image_url", "image_url": {"url": "[base64-image]"}},
    ]
    assert "YWJj" not in json.dumps(log.payload)


@pytest.mark.django_db
def test_technique_review_list_is_scoped_to_current_user(tmp_path):
    user = User.objects.create_user(email="technique-list@example.com", password="pass")
    other = User.objects.create_user(
        email="technique-list-other@example.com", password="pass"
    )
    with override_settings(MEDIA_ROOT=tmp_path):
        TechniqueReview.objects.create(
            user=user,
            status=TechniqueReview.Status.FAILED,
            video_file=SimpleUploadedFile(
                "mine.mp4", b"fake-video", content_type="video/mp4"
            ),
        )
        TechniqueReview.objects.create(
            user=other,
            status=TechniqueReview.Status.FAILED,
            video_file=SimpleUploadedFile(
                "other.mp4", b"fake-video", content_type="video/mp4"
            ),
        )
    client = APIClient()
    client.force_authenticate(user=user)

    with override_settings(MEDIA_ROOT=tmp_path):
        response = client.get("/api/technique-reviews/")

    assert response.status_code == 200
    assert len(response.data["items"]) == 1
    assert response.data["items"][0]["video_filename"].startswith("mine")


@pytest.mark.django_db
def test_technique_review_upload_can_return_processing_in_async_mode(
    monkeypatch, tmp_path
):
    user = User.objects.create_user(
        email="technique-async@example.com", password="pass"
    )
    client = APIClient()
    client.force_authenticate(user=user)

    def fail_if_called(self, *, forced_exercise=None):
        raise AssertionError("analysis must be handled by the worker")

    monkeypatch.setattr(
        "workouts.views.TechniqueReviewAnalysisService.analyze", fail_if_called
    )

    with override_settings(MEDIA_ROOT=tmp_path, TECHNIQUE_ANALYSIS_MODE="async"):
        response = client.post(
            "/api/technique-reviews/",
            {
                "video": SimpleUploadedFile(
                    "async.mp4", b"fake-video", content_type="video/mp4"
                )
            },
            format="multipart",
        )

    assert response.status_code == 201
    assert response.data["status"] == "processing"
    assert TechniqueReview.objects.filter(
        user=user, status=TechniqueReview.Status.PROCESSING
    ).exists()


@pytest.mark.django_db
def test_technique_review_upload_accepts_temporary_uploaded_file(monkeypatch, tmp_path):
    user = User.objects.create_user(
        email="technique-temp-upload@example.com", password="pass"
    )
    client = APIClient()
    client.force_authenticate(user=user)

    def fail_if_called(self, *, forced_exercise=None):
        raise AssertionError("analysis must be handled by the worker")

    seen_upload_types = []
    original_validate = TechniqueReviewCreateSerializer.validate

    def capture_upload_type(self, attrs):
        seen_upload_types.append(type(attrs["video_file"]))
        return original_validate(self, attrs)

    monkeypatch.setattr(
        "workouts.views.TechniqueReviewAnalysisService.analyze", fail_if_called
    )
    monkeypatch.setattr(
        TechniqueReviewCreateSerializer, "validate", capture_upload_type
    )

    with override_settings(
        FILE_UPLOAD_MAX_MEMORY_SIZE=1,
        MEDIA_ROOT=tmp_path,
        TECHNIQUE_ANALYSIS_MODE="async",
    ):
        response = client.post(
            "/api/technique-reviews/",
            {
                "video": SimpleUploadedFile(
                    "temporary-upload.mp4",
                    b"fake-video-bytes" * 512,
                    content_type="video/mp4",
                )
            },
            format="multipart",
        )

    assert response.status_code == 201, response.content
    assert response.data["status"] == "processing"
    assert seen_upload_types == [TemporaryUploadedFile]
    assert TechniqueReview.objects.filter(user=user).exists()


@pytest.mark.django_db
def test_technique_review_upload_rejects_oversized_video(tmp_path):
    user = User.objects.create_user(email="technique-size@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)

    with override_settings(MEDIA_ROOT=tmp_path, TECHNIQUE_VIDEO_MAX_MB=1):
        response = client.post(
            "/api/technique-reviews/",
            {
                "video": SimpleUploadedFile(
                    "large.mp4",
                    b"0" * (1024 * 1024 + 1),
                    content_type="video/mp4",
                )
            },
            format="multipart",
        )

    assert response.status_code == 400
    assert response.data["error_code"] == "video_too_large"
    assert TechniqueReview.objects.filter(user=user).count() == 0


@pytest.mark.django_db
def test_technique_review_upload_rejects_long_video(monkeypatch, tmp_path):
    user = User.objects.create_user(
        email="technique-duration@example.com", password="pass"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    monkeypatch.setattr(
        "workouts.serializers._probe_video_duration_seconds", lambda value: 31.5
    )

    with override_settings(MEDIA_ROOT=tmp_path, TECHNIQUE_VIDEO_MAX_SECONDS=30):
        response = client.post(
            "/api/technique-reviews/",
            {
                "video": SimpleUploadedFile(
                    "long.mp4", b"fake-video", content_type="video/mp4"
                )
            },
            format="multipart",
        )

    assert response.status_code == 400
    assert response.data["error_code"] == "video_too_long"
    assert TechniqueReview.objects.filter(user=user).count() == 0


@pytest.mark.django_db
def test_technique_review_upload_respects_daily_limit(tmp_path):
    user = User.objects.create_user(
        email="technique-limit@example.com", password="pass"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    with override_settings(MEDIA_ROOT=tmp_path):
        TechniqueReview.objects.create(
            user=user,
            status=TechniqueReview.Status.FAILED,
            video_file=SimpleUploadedFile(
                "already.mp4", b"fake-video", content_type="video/mp4"
            ),
        )

    with override_settings(MEDIA_ROOT=tmp_path, TECHNIQUE_REVIEW_DAILY_LIMIT=1):
        response = client.post(
            "/api/technique-reviews/",
            {
                "video": SimpleUploadedFile(
                    "next.mp4", b"fake-video", content_type="video/mp4"
                )
            },
            format="multipart",
        )

    assert response.status_code == 429
    assert response.data["error_code"] == "rate_limited"
    assert TechniqueReview.objects.filter(user=user).count() == 1


@pytest.mark.django_db
def test_technique_review_delete_removes_review_and_video(tmp_path):
    user = User.objects.create_user(
        email="technique-delete@example.com", password="pass"
    )
    client = APIClient()
    client.force_authenticate(user=user)
    with override_settings(MEDIA_ROOT=tmp_path):
        review = TechniqueReview.objects.create(
            user=user,
            status=TechniqueReview.Status.FAILED,
            video_file=SimpleUploadedFile(
                "delete-me.mp4", b"fake-video", content_type="video/mp4"
            ),
        )
        video_path = Path(review.video_file.path)
        assert video_path.exists()
        response = client.delete(f"/api/technique-reviews/{review.id}/")

    assert response.status_code == 204
    assert not TechniqueReview.objects.filter(id=review.id).exists()
    assert not video_path.exists()


@pytest.mark.django_db
def test_cleanup_technique_reviews_deletes_expired_files(tmp_path):
    user = User.objects.create_user(
        email="technique-cleanup@example.com", password="pass"
    )
    with override_settings(MEDIA_ROOT=tmp_path):
        old_review = TechniqueReview.objects.create(
            user=user,
            status=TechniqueReview.Status.FAILED,
            video_file=SimpleUploadedFile(
                "old.mp4", b"old-video", content_type="video/mp4"
            ),
        )
        fresh_review = TechniqueReview.objects.create(
            user=user,
            status=TechniqueReview.Status.FAILED,
            video_file=SimpleUploadedFile(
                "fresh.mp4", b"fresh-video", content_type="video/mp4"
            ),
        )
        TechniqueReview.objects.filter(id=old_review.id).update(
            created_at=timezone.now() - timedelta(days=40)
        )
        old_path = Path(old_review.video_file.path)
        fresh_path = Path(fresh_review.video_file.path)
        call_command("cleanup_technique_reviews", days=30)

    assert not TechniqueReview.objects.filter(id=old_review.id).exists()
    assert TechniqueReview.objects.filter(id=fresh_review.id).exists()
    assert not old_path.exists()
    assert fresh_path.exists()


@pytest.mark.django_db
def test_process_technique_reviews_command_processes_pending_review(
    monkeypatch, tmp_path
):
    user = User.objects.create_user(
        email="technique-worker@example.com", password="pass"
    )
    exercise = _build_exercise()
    with override_settings(MEDIA_ROOT=tmp_path):
        review = TechniqueReview.objects.create(
            user=user,
            status=TechniqueReview.Status.PROCESSING,
            exercise=exercise,
            video_file=SimpleUploadedFile(
                "worker.mp4", b"fake-video", content_type="video/mp4"
            ),
        )

    def fake_analyze(self, *, forced_exercise=None):
        assert forced_exercise == exercise
        self.review.status = TechniqueReview.Status.COMPLETED
        self.review.summary = "Разбор готов."
        self.review.save(update_fields=["status", "summary", "updated_at"])
        return self.review

    monkeypatch.setattr(
        "workouts.technique.TechniqueReviewAnalysisService.analyze", fake_analyze
    )

    call_command("process_technique_reviews", once=True)

    review.refresh_from_db()
    assert review.status == TechniqueReview.Status.COMPLETED
    assert review.summary == "Разбор готов."
