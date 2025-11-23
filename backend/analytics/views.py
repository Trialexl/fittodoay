from __future__ import annotations

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from analytics.serializers import DateRangeSerializer, TrendRangeSerializer
from analytics.services import (
    aggregate_daily_loads,
    aggregate_exercise_loads,
    build_ai_feed,
    build_program_trends,
)


class DailyAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        serializer = DateRangeSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        start, end = serializer.get_range()
        payload = aggregate_daily_loads(request.user, start, end)
        return Response({"start": start, "end": end, "items": payload})


class ExerciseAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        serializer = DateRangeSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        start, end = serializer.get_range()
        payload = aggregate_exercise_loads(request.user, start, end)
        return Response({"start": start, "end": end, "items": payload})


class AIRecommendationsPlaceholderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        feed = build_ai_feed(request.user)
        return Response(
            {
                "status": "pending",
                "message": "AI-рекомендации появятся после интеграции. Ниже подготовленные данные.",
                "feed": feed,
            }
        )


class ProgramTrendsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        serializer = TrendRangeSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        start, end = serializer.get_range()
        granularity = serializer.validated_data.get("granularity", "day")
        folders, trimmed_start, trimmed_end = build_program_trends(
            request.user, start, end, granularity=granularity
        )
        return Response(
            {
                "start": (trimmed_start or start).isoformat(),
                "end": (trimmed_end or end).isoformat(),
                "granularity": granularity,
                "folders": folders,
            }
        )

# Create your views here.
