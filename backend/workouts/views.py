from __future__ import annotations

import logging
import mimetypes
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Iterator, Tuple

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import FileResponse, Http404, StreamingHttpResponse
from django.utils import timezone
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework import permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from workouts.models import (
    Exercise_DB,
    TechniqueReview,
    WorkoutDay,
    WorkoutMusicTrack,
    WorkoutSetLog,
    WorkoutWeighIn,
)
from workouts.serializers import (
    RecommendationApplySerializer,
    TechniqueReviewConfirmExerciseSerializer,
    TechniqueReviewCreateSerializer,
    TechniqueReviewSerializer,
    WorkoutWeighInSerializer,
    WorkoutWeighInUpsertSerializer,
    WorkoutDaySerializer,
    WorkoutMusicTrackUploadSerializer,
    WorkoutPlanRequestSerializer,
    WorkoutSetLogSerializer,
)
from workouts.recommendations import (
    apply_recommendations,
    generate_recommendations_for_day,
)
from workouts.services import generate_daily_plan, update_workout_status
from workouts.technique import TechniqueReviewAnalysisService

logger = logging.getLogger(__name__)


_AUDIO_CONTENT_TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".webm": "audio/webm",
}


def _audio_head_hex(raw: bytes, size: int = 16) -> str:
    return raw[:size].hex() if raw else ""


def _safe_upload_debug(uploaded) -> tuple[int | None, str]:
    try:
        uploaded.seek(0)
        raw = uploaded.read(32)
        size = int(getattr(uploaded, "size", 0) or 0)
    except Exception:
        return None, ""
    finally:
        try:
            uploaded.seek(0)
        except Exception:
            pass
    return size, _audio_head_hex(raw)


def _first_error_value(value):
    if isinstance(value, (list, tuple)):
        return str(value[0]) if value else ""
    return str(value)


def _resolve_audio_content_type(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    explicit = _AUDIO_CONTENT_TYPES.get(suffix)
    if explicit:
        return explicit
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or "application/octet-stream"


def _decode_text_frame(payload: bytes) -> str:
    if not payload:
        return ""
    encoding = payload[0]
    body = payload[1:]
    if encoding == 0:
        return body.decode("latin-1", errors="ignore").strip("\x00 ").strip()
    if encoding == 1:
        return body.decode("utf-16", errors="ignore").strip("\x00 ").strip()
    if encoding == 2:
        return body.decode("utf-16-be", errors="ignore").strip("\x00 ").strip()
    if encoding == 3:
        return body.decode("utf-8", errors="ignore").strip("\x00 ").strip()
    return body.decode("utf-8", errors="ignore").strip("\x00 ").strip()


def _syncsafe_to_int(raw: bytes) -> int:
    if len(raw) != 4:
        return 0
    return (
        ((raw[0] & 0x7F) << 21)
        | ((raw[1] & 0x7F) << 14)
        | ((raw[2] & 0x7F) << 7)
        | (raw[3] & 0x7F)
    )


def _strip_oversized_id3v2_tag_from_mp3(uploaded, min_tag_size: int = 512 * 1024):
    filename = getattr(uploaded, "name", "") or ""
    if Path(filename).suffix.lower() != ".mp3":
        return uploaded
    try:
        uploaded.seek(0)
        raw = uploaded.read()
    except Exception:
        try:
            uploaded.seek(0)
        except Exception:
            pass
        return uploaded

    if len(raw) < 10 or raw[:3] != b"ID3":
        try:
            uploaded.seek(0)
        except Exception:
            pass
        return uploaded

    tag_size = _syncsafe_to_int(raw[6:10])
    tag_end = 10 + tag_size
    if tag_size < min_tag_size or tag_end > len(raw):
        try:
            uploaded.seek(0)
        except Exception:
            pass
        return uploaded

    stripped = raw[tag_end:]
    try:
        uploaded.seek(0)
    except Exception:
        pass
    if not stripped.startswith((b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")):
        return uploaded
    return SimpleUploadedFile(
        filename,
        stripped,
        content_type=getattr(uploaded, "content_type", None) or "audio/mpeg",
    )


def normalize_uploaded_audio(uploaded):
    filename = getattr(uploaded, "name", "") or ""
    if Path(filename).suffix.lower() != ".mp3":
        return uploaded

    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        return _strip_oversized_id3v2_tag_from_mp3(uploaded)

    try:
        uploaded.seek(0)
        raw = uploaded.read()
    except Exception:
        try:
            uploaded.seek(0)
        except Exception:
            pass
        return _strip_oversized_id3v2_tag_from_mp3(uploaded)

    if not raw:
        try:
            uploaded.seek(0)
        except Exception:
            pass
        return uploaded

    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            input_path = Path(tmp_dir) / "input.mp3"
            output_path = Path(tmp_dir) / "output.mp3"
            input_path.write_bytes(raw)
            completed = subprocess.run(
                [
                    ffmpeg_path,
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(input_path),
                    "-map_metadata",
                    "-1",
                    "-vn",
                    "-c:a",
                    "libmp3lame",
                    "-b:a",
                    "192k",
                    "-ar",
                    "44100",
                    str(output_path),
                ],
                check=False,
                capture_output=True,
            )
            if completed.returncode == 0 and output_path.exists():
                normalized = output_path.read_bytes()
                if normalized:
                    return SimpleUploadedFile(
                        filename,
                        normalized,
                        content_type=getattr(uploaded, "content_type", None)
                        or "audio/mpeg",
                    )
    except Exception:
        pass
    finally:
        try:
            uploaded.seek(0)
        except Exception:
            pass

    return _strip_oversized_id3v2_tag_from_mp3(uploaded)


def _extract_metadata_from_id3(head: bytes) -> Tuple[str, str, str]:
    if len(head) < 10 or head[:3] != b"ID3":
        return "", "", ""
    version = head[3]
    tag_size = _syncsafe_to_int(head[6:10])
    if tag_size <= 0:
        return "", "", ""
    end = min(len(head), 10 + tag_size)
    pos = 10
    artist = ""
    title = ""
    album = ""
    while pos + 10 <= end:
        frame_id = head[pos : pos + 4].decode("latin-1", errors="ignore")
        if not frame_id.strip("\x00"):
            break
        size_raw = head[pos + 4 : pos + 8]
        frame_size = (
            _syncsafe_to_int(size_raw)
            if version >= 4
            else int.from_bytes(size_raw, "big", signed=False)
        )
        if frame_size <= 0:
            pos += 10
            continue
        frame_start = pos + 10
        frame_end = frame_start + frame_size
        if frame_end > end:
            break
        payload = head[frame_start:frame_end]
        if frame_id == "TPE1" and not artist:
            artist = _decode_text_frame(payload)
        elif frame_id == "TIT2" and not title:
            title = _decode_text_frame(payload)
        elif frame_id == "TALB" and not album:
            album = _decode_text_frame(payload)
        if artist and title and album:
            break
        pos = frame_end
    return artist, title, album


def _extract_metadata_from_id3v1(tail: bytes) -> Tuple[str, str, str]:
    if len(tail) < 128 or tail[:3] != b"TAG":
        return "", "", ""
    title = tail[3:33].decode("latin-1", errors="ignore").strip("\x00 ").strip()
    artist = tail[33:63].decode("latin-1", errors="ignore").strip("\x00 ").strip()
    album = tail[63:93].decode("latin-1", errors="ignore").strip("\x00 ").strip()
    return artist, title, album


def extract_track_metadata(uploaded, fallback_title: str) -> Tuple[str, str, str]:
    artist = ""
    title = fallback_title
    album = ""
    try:
        uploaded.seek(0)
        head = uploaded.read(256 * 1024)
        artist_id3, title_id3, album_id3 = _extract_metadata_from_id3(head)
        if artist_id3:
            artist = artist_id3
        if title_id3:
            title = title_id3
        if album_id3:
            album = album_id3
        if not artist or title == fallback_title or not album:
            total_size = getattr(uploaded, "size", 0) or 0
            if total_size >= 128:
                uploaded.seek(max(total_size - 128, 0))
                tail = uploaded.read(128)
                artist_v1, title_v1, album_v1 = _extract_metadata_from_id3v1(tail)
                if not artist and artist_v1:
                    artist = artist_v1
                if title == fallback_title and title_v1:
                    title = title_v1
                if not album and album_v1:
                    album = album_v1
    except Exception:
        pass
    finally:
        try:
            uploaded.seek(0)
        except Exception:
            pass
    return (
        (artist or "").strip(),
        (title or fallback_title).strip(),
        (album or "").strip(),
    )


def _backfill_track_metadata_if_missing(track: WorkoutMusicTrack) -> None:
    if not track.file:
        return
    needs_backfill = not track.album or not track.artist or not track.title
    if not needs_backfill:
        return
    fallback_title = track.title or Path(track.file.name).stem.replace("_", " ")
    try:
        with track.file.open("rb") as file_obj:
            artist, title, album = extract_track_metadata(
                file_obj, fallback_title=fallback_title
            )
    except Exception:
        return
    update_fields: list[str] = []
    if not track.artist and artist:
        track.artist = artist
        update_fields.append("artist")
    if not track.title and title:
        track.title = title
        update_fields.append("title")
    if not track.album and album:
        track.album = album
        update_fields.append("album")
    if update_fields:
        track.save(update_fields=update_fields)


class _RangeNotSatisfiable(Exception):
    pass


def _parse_byte_range(
    range_header: str | None, file_size: int
) -> tuple[int, int] | None:
    if not range_header:
        return None
    if file_size <= 0:
        raise _RangeNotSatisfiable
    if not range_header.startswith("bytes="):
        return None
    raw_spec = range_header[6:].strip()
    if not raw_spec or "," in raw_spec or "-" not in raw_spec:
        raise _RangeNotSatisfiable
    start_raw, end_raw = raw_spec.split("-", 1)
    start_raw = start_raw.strip()
    end_raw = end_raw.strip()

    if not start_raw:
        # bytes=-500 -> last 500 bytes
        if not end_raw:
            raise _RangeNotSatisfiable
        try:
            suffix_len = int(end_raw)
        except ValueError as exc:
            raise _RangeNotSatisfiable from exc
        if suffix_len <= 0:
            raise _RangeNotSatisfiable
        start = max(file_size - suffix_len, 0)
        end = file_size - 1
        return start, end

    try:
        start = int(start_raw)
    except ValueError as exc:
        raise _RangeNotSatisfiable from exc
    if start < 0 or start >= file_size:
        raise _RangeNotSatisfiable

    if end_raw:
        try:
            end = int(end_raw)
        except ValueError as exc:
            raise _RangeNotSatisfiable from exc
        if end < start:
            raise _RangeNotSatisfiable
    else:
        end = file_size - 1

    end = min(end, file_size - 1)
    return start, end


def _iter_file_chunk(
    file_obj, remaining: int, chunk_size: int = 64 * 1024
) -> Iterator[bytes]:
    try:
        bytes_left = remaining
        while bytes_left > 0:
            data = file_obj.read(min(chunk_size, bytes_left))
            if not data:
                break
            bytes_left -= len(data)
            yield data
    finally:
        file_obj.close()


class WorkoutPlanView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        serializer = WorkoutPlanRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        target_date = serializer.get_date()
        day = generate_daily_plan(request.user, target_date=target_date)
        payload = WorkoutDaySerializer(day).data
        weigh_in = WorkoutWeighIn.objects.filter(
            user=request.user, date=target_date
        ).first()
        payload["weigh_in"] = (
            WorkoutWeighInSerializer(weigh_in).data
            if weigh_in
            else {"date": target_date.isoformat(), "weight_kg": None, "note": ""}
        )
        return Response(payload)


class WorkoutWeighInView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        serializer = WorkoutPlanRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        target_date = serializer.get_date()
        weigh_in = WorkoutWeighIn.objects.filter(
            user=request.user, date=target_date
        ).first()
        if not weigh_in:
            return Response(
                {"date": target_date.isoformat(), "weight_kg": None, "note": ""}
            )
        return Response(WorkoutWeighInSerializer(weigh_in).data)

    def put(self, request, *args, **kwargs):
        serializer = WorkoutWeighInUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_date = serializer.get_date()
        weigh_in, _ = WorkoutWeighIn.objects.update_or_create(
            user=request.user,
            date=target_date,
            defaults={
                "weight_kg": serializer.validated_data["weight_kg"],
                "note": serializer.validated_data.get("note", ""),
            },
        )
        return Response(WorkoutWeighInSerializer(weigh_in).data)


class WorkoutSetLogViewSet(viewsets.ModelViewSet):
    serializer_class = WorkoutSetLogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return WorkoutSetLog.objects.filter(
            workout_day__user=self.request.user
        ).order_by("-created_at")

    def perform_create(self, serializer):
        log = serializer.save()
        update_workout_status(log.workout_day)

    def perform_destroy(self, instance):
        day = instance.workout_day
        super().perform_destroy(instance)
        update_workout_status(day)


class TechniqueReviewListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, *args, **kwargs):
        reviews = TechniqueReview.objects.filter(user=request.user).select_related(
            "exercise"
        )[:20]
        return Response({"items": TechniqueReviewSerializer(reviews, many=True).data})

    def post(self, request, *args, **kwargs):
        daily_limit = max(int(getattr(settings, "TECHNIQUE_REVIEW_DAILY_LIMIT", 10)), 1)
        since = timezone.now() - timezone.timedelta(hours=24)
        recent_count = TechniqueReview.objects.filter(
            user=request.user,
            created_at__gte=since,
        ).count()
        if recent_count >= daily_limit:
            return Response(
                {
                    "message": "Дневной лимит проверок техники исчерпан. Попробуйте завтра.",
                    "error_code": "rate_limited",
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        upload = (
            request.FILES.get("video_file")
            or request.FILES.get("video")
            or request.data.get("video_file")
            or request.data.get("video")
        )
        serializer = TechniqueReviewCreateSerializer(
            data={"video_file": upload}, context={"request": request}
        )
        if not serializer.is_valid():
            errors = serializer.errors
            if "error_code" in errors:
                return Response(
                    {
                        "message": _first_error_value(errors.get("message")),
                        "error_code": _first_error_value(errors.get("error_code")),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raise ValidationError(errors)
        review = serializer.save()
        if getattr(settings, "TECHNIQUE_ANALYSIS_MODE", "sync") == "async":
            return Response(TechniqueReviewSerializer(review).data, status=201)
        TechniqueReviewAnalysisService(review).analyze()
        review.refresh_from_db()
        return Response(TechniqueReviewSerializer(review).data, status=201)


class TechniqueReviewDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, review_id: int, *args, **kwargs):
        try:
            review = TechniqueReview.objects.select_related("exercise").get(
                id=review_id,
                user=request.user,
            )
        except TechniqueReview.DoesNotExist as exc:
            raise Http404("Technique review not found") from exc
        return Response(TechniqueReviewSerializer(review).data)

    def delete(self, request, review_id: int, *args, **kwargs):
        try:
            review = TechniqueReview.objects.get(id=review_id, user=request.user)
        except TechniqueReview.DoesNotExist as exc:
            raise Http404("Technique review not found") from exc
        video_file = review.video_file
        review.delete()
        if video_file:
            video_file.delete(save=False)
        return Response(status=204)


class TechniqueReviewConfirmExerciseView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, review_id: int, *args, **kwargs):
        try:
            review = TechniqueReview.objects.select_related("exercise").get(
                id=review_id,
                user=request.user,
            )
        except TechniqueReview.DoesNotExist as exc:
            raise Http404("Technique review not found") from exc
        serializer = TechniqueReviewConfirmExerciseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        exercise = serializer.validated_data["exercise_id"]
        if not isinstance(exercise, Exercise_DB):
            raise ValidationError("Упражнение не найдено")
        review.exercise = exercise
        review.detected_exercise_name = exercise.name
        review.detected_exercise_confidence = 1.0
        review.status = TechniqueReview.Status.PROCESSING
        review.error_code = ""
        review.save(
            update_fields=[
                "exercise",
                "detected_exercise_name",
                "detected_exercise_confidence",
                "status",
                "error_code",
                "updated_at",
            ]
        )
        if getattr(settings, "TECHNIQUE_ANALYSIS_MODE", "sync") == "async":
            return Response(TechniqueReviewSerializer(review).data)
        TechniqueReviewAnalysisService(review).analyze(forced_exercise=exercise)
        review.refresh_from_db()
        return Response(TechniqueReviewSerializer(review).data)


class WorkoutRecommendationsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        serializer = WorkoutPlanRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        target_date = serializer.get_date()
        try:
            day = WorkoutDay.objects.get(user=request.user, date=target_date)
        except WorkoutDay.DoesNotExist:
            return Response({"date": target_date.isoformat(), "folders": []})
        payload = generate_recommendations_for_day(day)
        return Response({"date": target_date.isoformat(), "folders": payload})


class ApplyWorkoutRecommendationsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = RecommendationApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        items = serializer.validated_data.get("items") or []
        if not items:
            raise ValidationError("Нет данных для обновления")
        try:
            updated = apply_recommendations(request.user, items)
        except ValueError:
            raise ValidationError("Нельзя обновить выбранные упражнения")
        return Response({"updated": updated})


class WorkoutMusicTracksView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        tracks = list(
            WorkoutMusicTrack.objects.filter(is_active=True).order_by("title", "id")
        )
        for track in tracks:
            _backfill_track_metadata_if_missing(track)
        items = [
            {
                "id": track.id,
                "name": track.display_name,
                "title": track.title,
                "artist": track.artist,
                "album": track.album,
                "filename": track.file.name if track.file else "",
                "is_mine": track.owner_id == request.user.id,
                "source_type": "stream" if track.is_stream else "file",
                "stream_category": track.stream_category or None,
                "url": (
                    track.stream_url
                    if track.is_stream
                    else f"/api/workouts/music/tracks/{track.id}/file/"
                ),
            }
            for track in tracks
        ]
        return Response({"items": items})


class WorkoutMusicTrackUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        uploaded_files = request.FILES.getlist("files")
        if not uploaded_files:
            single = request.FILES.get("file")
            if single:
                uploaded_files = [single]
        if not uploaded_files:
            raise ValidationError("Не переданы файлы для загрузки")

        created_items = []
        for uploaded in uploaded_files:
            original_name = getattr(uploaded, "name", "") or ""
            original_content_type = getattr(uploaded, "content_type", None) or ""
            original_size, original_head = _safe_upload_debug(uploaded)
            fallback_title = Path(uploaded.name).stem
            artist, title, album = extract_track_metadata(
                uploaded, fallback_title=fallback_title
            )
            uploaded = normalize_uploaded_audio(uploaded)
            normalized_size, normalized_head = _safe_upload_debug(uploaded)
            logger.warning(
                "music_upload_debug user_id=%s name=%s original_content_type=%s original_size=%s original_head=%s normalized_name=%s normalized_size=%s normalized_head=%s artist=%s title=%s album=%s",
                request.user.id,
                original_name,
                original_content_type,
                original_size,
                original_head,
                getattr(uploaded, "name", "") or "",
                normalized_size,
                normalized_head,
                artist,
                title,
                album,
            )
            payload = {
                "artist": artist,
                "album": album,
                "title": title,
                "file": uploaded,
            }
            serializer = WorkoutMusicTrackUploadSerializer(data=payload)
            serializer.is_valid(raise_exception=True)
            track = serializer.save(owner=request.user, is_active=True)
            created_items.append(
                {
                    "id": track.id,
                    "name": track.display_name,
                    "title": track.title,
                    "artist": track.artist,
                    "album": track.album,
                    "filename": track.file.name,
                    "is_mine": True,
                    "source_type": "file",
                    "stream_category": None,
                    "url": f"/api/workouts/music/tracks/{track.id}/file/",
                }
            )
        return Response({"items": created_items}, status=201)


class WorkoutMusicTrackDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, track_id: int, *args, **kwargs):
        try:
            track = WorkoutMusicTrack.objects.get(id=track_id, owner=request.user)
        except WorkoutMusicTrack.DoesNotExist:
            raise Http404("Track not found")
        track.delete()
        return Response(status=204)


class WorkoutMusicTrackFileView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, track_id: int, *args, **kwargs):
        user = request.user if request.user.is_authenticated else None
        if user is None:
            token_key = request.query_params.get("token")
            if token_key:
                token = (
                    Token.objects.filter(key=token_key).select_related("user").first()
                )
                if token:
                    user = token.user
        if user is None:
            return Response(
                {"detail": "Authentication credentials were not provided."}, status=403
            )
        try:
            track = WorkoutMusicTrack.objects.get(id=track_id, is_active=True)
        except WorkoutMusicTrack.DoesNotExist:
            raise Http404("Track not found")
        if not track.file:
            raise Http404("Track not found")
        content_type = _resolve_audio_content_type(track.file.name)
        file_size = track.file.size or 0
        range_header = request.headers.get("Range") or request.META.get("HTTP_RANGE")
        try:
            byte_range = _parse_byte_range(range_header, file_size)
        except _RangeNotSatisfiable:
            response = Response(status=416)
            response["Content-Range"] = f"bytes */{file_size}"
            response["Accept-Ranges"] = "bytes"
            return response

        file_head = ""
        try:
            with track.file.open("rb") as debug_file:
                file_head = _audio_head_hex(debug_file.read(32))
        except Exception:
            file_head = ""

        if byte_range is None:
            response = FileResponse(
                track.file.open("rb"),
                content_type=content_type or "application/octet-stream",
            )
            if file_size > 0:
                response["Content-Length"] = str(file_size)
        else:
            start, end = byte_range
            length = end - start + 1
            file_obj = track.file.open("rb")
            file_obj.seek(start)
            response = StreamingHttpResponse(
                _iter_file_chunk(file_obj, length),
                status=206,
                content_type=content_type or "application/octet-stream",
            )
            response["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            response["Content-Length"] = str(length)
        response["Accept-Ranges"] = "bytes"
        logger.warning(
            "music_file_debug user_id=%s track_id=%s filename=%s size=%s content_type=%s range=%s status=%s response_length=%s file_head=%s",
            user.id if user else None,
            track.id,
            track.file.name,
            file_size,
            content_type,
            range_header,
            response.status_code,
            response.get("Content-Length"),
            file_head,
        )
        return response
