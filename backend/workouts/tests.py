from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from programs.models import DayTemplate, ProgramFolder, TemplateExercise
from workouts.models import Exercise_DB, WorkoutMusicTrack, WorkoutSetLog, WorkoutWeighIn
from workouts.recommendations import generate_recommendations_for_day
from workouts.services import generate_daily_plan, template_matches_date

User = get_user_model()
TEST_DATE = date(2024, 6, 3)  # Monday


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
            actual_weight=Decimal(str(weights[idx])) if has_weight and weights[idx] is not None else None,
            actual_time=45 if has_time else None,
        )
    return day, te


def _first_recommendation(day):
    folders = generate_recommendations_for_day(day)
    assert folders, "Ожидали хотя бы одну папку с рекомендациями"
    assert folders[0]["recommendations"], "Ожидали хотя бы одну рекомендацию"
    return folders[0]["recommendations"][0]


@pytest.mark.django_db
def test_template_matches_weekly_day():
    folder = ProgramFolder.objects.create(user=User.objects.create_user("a@a.a"), name="Тестовая папка")
    template = DayTemplate.objects.create(
        folder=folder,
        name="Monday",
        schedule_type=DayTemplate.ScheduleType.WEEKLY,
        schedule_config={"days_of_week": [0, 2]},
    )
    assert template_matches_date(template, date(2024, 6, 3))  # Monday
    assert not template_matches_date(template, date(2024, 6, 4))  # Tuesday


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
    other_user = User.objects.create_user(email="musicother@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)
    with override_settings(MUSIC_ROOT=tmp_path):
        first = WorkoutMusicTrack.objects.create(
            title="Warmup",
            album="Manual Album",
            is_active=True,
            owner=user,
            file=SimpleUploadedFile("warmup.mp3", b"fake-mp3", content_type="audio/mpeg"),
        )
        global_track = WorkoutMusicTrack.objects.create(
            title="Global",
            is_active=True,
            owner=None,
            file=SimpleUploadedFile("global.mp3", b"fake-mp3", content_type="audio/mpeg"),
        )
        other_track = WorkoutMusicTrack.objects.create(
            title="Other user",
            is_active=True,
            owner=other_user,
            file=SimpleUploadedFile("other.mp3", b"fake-mp3", content_type="audio/mpeg"),
        )
        WorkoutMusicTrack.objects.create(
            title="Hidden",
            is_active=False,
            file=SimpleUploadedFile("hidden.mp3", b"fake-mp3", content_type="audio/mpeg"),
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
    other_user = User.objects.create_user(email="musicfileother@example.com", password="pass")
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
            file=SimpleUploadedFile("inactive.mp3", b"fake-mp3", content_type="audio/mpeg"),
        )
        foreign = WorkoutMusicTrack.objects.create(
            title="Foreign",
            is_active=True,
            owner=other_user,
            file=SimpleUploadedFile("foreign.mp3", b"fake-mp3", content_type="audio/mpeg"),
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
def test_music_track_file_endpoint_returns_416_for_invalid_range(tmp_path):
    user = User.objects.create_user(email="musicrangeinvalid@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)
    with override_settings(MUSIC_ROOT=tmp_path):
        track = WorkoutMusicTrack.objects.create(
            title="Range invalid",
            is_active=True,
            owner=user,
            file=SimpleUploadedFile("range-invalid.mp3", b"0123456789", content_type="audio/mpeg"),
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
                "file": SimpleUploadedFile("mine.mp3", b"fake-mp3", content_type="audio/mpeg"),
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
def test_music_upload_endpoint_accepts_multiple_files(tmp_path):
    user = User.objects.create_user(email="musicmulti@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)

    with override_settings(MUSIC_ROOT=tmp_path):
        response = client.post(
            "/api/workouts/music/tracks/upload/",
            {
                "files": [
                    SimpleUploadedFile("warmup.mp3", b"fake-mp3", content_type="audio/mpeg"),
                    SimpleUploadedFile("rest.mp3", b"fake-mp3", content_type="audio/mpeg"),
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
                "file": SimpleUploadedFile("meta.mp3", payload, content_type="audio/mpeg"),
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
            file=SimpleUploadedFile("delete.mp3", b"fake-mp3", content_type="audio/mpeg"),
        )
        stored_path = tmp_path / track.file.name
        assert stored_path.exists()
        response = client.delete(f"/api/workouts/music/tracks/{track.id}/")

    assert response.status_code == 204
    assert not WorkoutMusicTrack.objects.filter(id=track.id).exists()
    assert not stored_path.exists()


@pytest.mark.django_db
def test_music_track_delete_endpoint_forbidden_for_foreign_and_system_track(tmp_path):
    user = User.objects.create_user(email="musicdeleteowner@example.com", password="pass")
    other = User.objects.create_user(email="musicdeleteother@example.com", password="pass")
    client = APIClient()
    client.force_authenticate(user=user)
    with override_settings(MUSIC_ROOT=tmp_path):
        foreign = WorkoutMusicTrack.objects.create(
            title="Foreign",
            is_active=True,
            owner=other,
            file=SimpleUploadedFile("foreign.mp3", b"fake-mp3", content_type="audio/mpeg"),
        )
        system = WorkoutMusicTrack.objects.create(
            title="System",
            is_active=True,
            owner=None,
            file=SimpleUploadedFile("system.mp3", b"fake-mp3", content_type="audio/mpeg"),
        )
        foreign_resp = client.delete(f"/api/workouts/music/tracks/{foreign.id}/")
        system_resp = client.delete(f"/api/workouts/music/tracks/{system.id}/")

    assert foreign_resp.status_code == 404
    assert system_resp.status_code == 404


@pytest.mark.django_db
def test_music_track_file_endpoint_allows_token_query_auth(tmp_path):
    user = User.objects.create_user(email="musicquerytoken@example.com", password="pass")
    token = Token.objects.create(user=user)
    client = APIClient()
    with override_settings(MUSIC_ROOT=tmp_path):
        track = WorkoutMusicTrack.objects.create(
            title="Query token",
            is_active=True,
            owner=user,
            file=SimpleUploadedFile("query.mp3", b"fake-mp3", content_type="audio/mpeg"),
        )
        response = client.get(f"/api/workouts/music/tracks/{track.id}/file/?token={token.key}")
    assert response.status_code == 200
