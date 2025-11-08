from django.urls import path

from analytics.views import (
    AIRecommendationsPlaceholderView,
    DailyAnalyticsView,
    ExerciseAnalyticsView,
)

app_name = "analytics"

urlpatterns = [
    path("days/", DailyAnalyticsView.as_view(), name="days"),
    path("exercises/", ExerciseAnalyticsView.as_view(), name="exercises"),
    path("ai-feed/", AIRecommendationsPlaceholderView.as_view(), name="ai-feed"),
]
