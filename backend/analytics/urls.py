from django.urls import path

from analytics.views import (
    AIRecommendationsPlaceholderView,
    DailyAnalyticsView,
    ExerciseAnalyticsView,
    ProgramTrendsView,
)

app_name = "analytics"

urlpatterns = [
    path("days/", DailyAnalyticsView.as_view(), name="days"),
    path("exercises/", ExerciseAnalyticsView.as_view(), name="exercises"),
     path("program-trends/", ProgramTrendsView.as_view(), name="program-trends"),
    path("ai-feed/", AIRecommendationsPlaceholderView.as_view(), name="ai-feed"),
]
