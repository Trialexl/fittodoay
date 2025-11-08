from __future__ import annotations

from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from analytics.serializers import DateRangeSerializer
from analytics.services import (
    aggregate_daily_loads,
    aggregate_exercise_loads,
    build_ai_feed,
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

# Create your views here.
