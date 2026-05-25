from django.contrib import admin
from django.urls import include, path
from workouts.views import (
    TechniqueReviewConfirmExerciseView,
    TechniqueReviewDetailView,
    TechniqueReviewListCreateView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("accounts.urls")),
    path("api/", include("agents.urls")),
    path("api/", include("exercises.urls")),
    path(
        "api/technique-reviews/",
        TechniqueReviewListCreateView.as_view(),
        name="technique-review-list",
    ),
    path(
        "api/technique-reviews/<int:review_id>/",
        TechniqueReviewDetailView.as_view(),
        name="technique-review-detail",
    ),
    path(
        "api/technique-reviews/<int:review_id>/confirm-exercise/",
        TechniqueReviewConfirmExerciseView.as_view(),
        name="technique-review-confirm-exercise",
    ),
    path("api/programs/", include("programs.urls")),
    path("api/workouts/", include("workouts.urls")),
    path("api/analytics/", include("analytics.urls")),
]
