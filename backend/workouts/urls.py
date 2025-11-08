from django.urls import path
from rest_framework.routers import DefaultRouter

from workouts.views import WorkoutPlanView, WorkoutSetLogViewSet

router = DefaultRouter()
router.register(r"logs", WorkoutSetLogViewSet, basename="workout-log")

urlpatterns = [
    path("plan/", WorkoutPlanView.as_view(), name="workout-plan"),
]

urlpatterns += router.urls
