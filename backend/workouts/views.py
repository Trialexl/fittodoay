from __future__ import annotations

from datetime import date

from rest_framework import permissions, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from workouts.models import WorkoutDay, WorkoutSetLog
from workouts.serializers import (
    RecommendationApplySerializer,
    WorkoutDaySerializer,
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
        return Response(payload)


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
