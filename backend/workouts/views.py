from __future__ import annotations

from datetime import date
import mimetypes
from pathlib import Path
from typing import Tuple

from django.http import FileResponse, Http404
from django.db.models import Q
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework import permissions, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from workouts.models import WorkoutDay, WorkoutMusicTrack, WorkoutSetLog, WorkoutWeighIn
from workouts.serializers import (
    RecommendationApplySerializer,
    WorkoutWeighInSerializer,
    WorkoutWeighInUpsertSerializer,
    WorkoutDaySerializer,
    WorkoutMusicTrackUploadSerializer,
    WorkoutPlanRequestSerializer,
    WorkoutSetLogSerializer,
)
from workouts.recommendations import apply_recommendations, generate_recommendations_for_day
from workouts.services import generate_daily_plan, update_workout_status


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
    return ((raw[0] & 0x7F) << 21) | ((raw[1] & 0x7F) << 14) | ((raw[2] & 0x7F) << 7) | (raw[3] & 0x7F)


def _extract_metadata_from_id3(head: bytes) -> Tuple[str, str]:
    if len(head) < 10 or head[:3] != b"ID3":
        return "", ""
    version = head[3]
    tag_size = _syncsafe_to_int(head[6:10])
    if tag_size <= 0:
        return "", ""
    end = min(len(head), 10 + tag_size)
    pos = 10
    artist = ""
    title = ""
    while pos + 10 <= end:
        frame_id = head[pos : pos + 4].decode("latin-1", errors="ignore")
        if not frame_id.strip("\x00"):
            break
        size_raw = head[pos + 4 : pos + 8]
        frame_size = _syncsafe_to_int(size_raw) if version >= 4 else int.from_bytes(size_raw, "big", signed=False)
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
        if artist and title:
            break
        pos = frame_end
    return artist, title


def _extract_metadata_from_id3v1(tail: bytes) -> Tuple[str, str]:
    if len(tail) < 128 or tail[:3] != b"TAG":
        return "", ""
    title = tail[3:33].decode("latin-1", errors="ignore").strip("\x00 ").strip()
    artist = tail[33:63].decode("latin-1", errors="ignore").strip("\x00 ").strip()
    return artist, title


def extract_track_metadata(uploaded, fallback_title: str) -> Tuple[str, str]:
    artist = ""
    title = fallback_title
    try:
        uploaded.seek(0)
        head = uploaded.read(256 * 1024)
        artist_id3, title_id3 = _extract_metadata_from_id3(head)
        if artist_id3:
            artist = artist_id3
        if title_id3:
            title = title_id3
        if not artist or title == fallback_title:
            total_size = getattr(uploaded, "size", 0) or 0
            if total_size >= 128:
                uploaded.seek(max(total_size - 128, 0))
                tail = uploaded.read(128)
                artist_v1, title_v1 = _extract_metadata_from_id3v1(tail)
                if not artist and artist_v1:
                    artist = artist_v1
                if title == fallback_title and title_v1:
                    title = title_v1
    except Exception:
        pass
    finally:
        try:
            uploaded.seek(0)
        except Exception:
            pass
    return (artist or "").strip(), (title or fallback_title).strip()


class WorkoutPlanView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        serializer = WorkoutPlanRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        target_date = serializer.get_date()
        day = generate_daily_plan(request.user, target_date=target_date)
        payload = WorkoutDaySerializer(day).data
        weigh_in = WorkoutWeighIn.objects.filter(user=request.user, date=target_date).first()
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
        weigh_in = WorkoutWeighIn.objects.filter(user=request.user, date=target_date).first()
        if not weigh_in:
            return Response({"date": target_date.isoformat(), "weight_kg": None, "note": ""})
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
        return WorkoutSetLog.objects.filter(workout_day__user=self.request.user).order_by(
            "-created_at"
        )

    def perform_create(self, serializer):
        log = serializer.save()
        update_workout_status(log.workout_day)

    def perform_destroy(self, instance):
        day = instance.workout_day
        super().perform_destroy(instance)
        update_workout_status(day)


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
        items = [
            {
                "id": track.id,
                "name": track.display_name,
                "title": track.title,
                "artist": track.artist,
                "filename": track.file.name,
                "is_mine": track.owner_id == request.user.id,
                "url": f"/api/workouts/music/tracks/{track.id}/file/",
            }
            for track in WorkoutMusicTrack.objects.filter(is_active=True)
            .filter(Q(owner=request.user) | Q(owner__isnull=True))
            .order_by("-owner_id", "title", "id")
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
            fallback_title = Path(uploaded.name).stem
            artist, title = extract_track_metadata(uploaded, fallback_title=fallback_title)
            payload = {
                "artist": artist,
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
                    "filename": track.file.name,
                    "is_mine": True,
                    "url": f"/api/workouts/music/tracks/{track.id}/file/",
                }
            )
        return Response({"items": created_items}, status=201)


class WorkoutMusicTrackDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, track_id: int, *args, **kwargs):
        try:
            track = WorkoutMusicTrack.objects.get(id=track_id, owner=request.user)
        except WorkoutMusicTrack.DoesNotExist as exc:
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
                token = Token.objects.filter(key=token_key).select_related("user").first()
                if token:
                    user = token.user
        if user is None:
            return Response({"detail": "Authentication credentials were not provided."}, status=403)
        try:
            track = WorkoutMusicTrack.objects.get(id=track_id, is_active=True)
        except WorkoutMusicTrack.DoesNotExist as exc:
            raise Http404("Track not found")
        if track.owner_id and track.owner_id != user.id:
            raise Http404("Track not found")
        if not track.file:
            raise Http404("Track not found")
        content_type, _ = mimetypes.guess_type(track.file.name)
        response = FileResponse(track.file.open("rb"), content_type=content_type or "application/octet-stream")
        response["Accept-Ranges"] = "bytes"
        return response
