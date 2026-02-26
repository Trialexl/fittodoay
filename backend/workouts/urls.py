from django.urls import path
from rest_framework.routers import DefaultRouter

from workouts.views import (
    ApplyWorkoutRecommendationsView,
    WorkoutPlanView,
    WorkoutRecommendationsView,
    WorkoutWeighInView,
    WorkoutSetLogViewSet,
)

router = DefaultRouter()
router.register(r"logs", WorkoutSetLogViewSet, basename="workout-log")

urlpatterns = [
    path("plan/", WorkoutPlanView.as_view(), name="workout-plan"),
    path("weigh-in/", WorkoutWeighInView.as_view(), name="workout-weigh-in"),
    path("recommendations/", WorkoutRecommendationsView.as_view(), name="workout-recommendations"),
    path(
        "recommendations/apply/",
        ApplyWorkoutRecommendationsView.as_view(),
        name="workout-recommendations-apply",
    ),
]

urlpatterns += router.urls
