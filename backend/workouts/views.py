from __future__ import annotations

from datetime import date
import mimetypes

from django.http import FileResponse, Http404
from django.db.models import Q
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework import permissions, viewsets
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
        serializer = WorkoutMusicTrackUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        track = serializer.save(owner=request.user, is_active=True)
        return Response(
            {
                "id": track.id,
                "name": track.display_name,
                "filename": track.file.name,
                "is_mine": True,
                "url": f"/api/workouts/music/tracks/{track.id}/file/",
            },
            status=201,
        )


class WorkoutMusicTrackFileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, track_id: int, *args, **kwargs):
        try:
            track = WorkoutMusicTrack.objects.get(id=track_id, is_active=True)
        except WorkoutMusicTrack.DoesNotExist as exc:
            raise Http404("Track not found")
        if track.owner_id and track.owner_id != request.user.id:
            raise Http404("Track not found")
        if not track.file:
            raise Http404("Track not found")
        content_type, _ = mimetypes.guess_type(track.file.name)
        response = FileResponse(track.file.open("rb"), content_type=content_type or "application/octet-stream")
        response["Accept-Ranges"] = "bytes"
        return response
