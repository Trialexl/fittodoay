from django.urls import path
from rest_framework.routers import DefaultRouter

from workouts.views import (
    ApplyWorkoutRecommendationsView,
    WorkoutMusicTrackDetailView,
    WorkoutPlanView,
    WorkoutRecommendationsView,
    WorkoutMusicTrackFileView,
    WorkoutMusicTrackUploadView,
    WorkoutMusicTracksView,
    WorkoutWeighInView,
    WorkoutSetLogViewSet,
)

router = DefaultRouter()
router.register(r"logs", WorkoutSetLogViewSet, basename="workout-log")

urlpatterns = [
    path("plan/", WorkoutPlanView.as_view(), name="workout-plan"),
    path("weigh-in/", WorkoutWeighInView.as_view(), name="workout-weigh-in"),
    path(
        "music/tracks/", WorkoutMusicTracksView.as_view(), name="workout-music-tracks"
    ),
    path(
        "music/tracks/upload/",
        WorkoutMusicTrackUploadView.as_view(),
        name="workout-music-track-upload",
    ),
    path(
        "music/tracks/<int:track_id>/",
        WorkoutMusicTrackDetailView.as_view(),
        name="workout-music-track-detail",
    ),
    path(
        "music/tracks/<int:track_id>/file/",
        WorkoutMusicTrackFileView.as_view(),
        name="workout-music-track-file",
    ),
    path(
        "recommendations/",
        WorkoutRecommendationsView.as_view(),
        name="workout-recommendations",
    ),
    path(
        "recommendations/apply/",
        ApplyWorkoutRecommendationsView.as_view(),
        name="workout-recommendations-apply",
    ),
]

urlpatterns += router.urls
