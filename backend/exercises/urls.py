from django.urls import path

from .views import (
    CustomExerciseDetailView,
    CustomExerciseListCreateView,
    ExerciseListView,
)

app_name = "exercises"

urlpatterns = [
    path("exercises/", ExerciseListView.as_view(), name="exercise-list"),
    path("exercises/custom/", CustomExerciseListCreateView.as_view(), name="custom-list"),
    path(
        "exercises/custom/<int:pk>/",
        CustomExerciseDetailView.as_view(),
        name="custom-detail",
    ),
]
