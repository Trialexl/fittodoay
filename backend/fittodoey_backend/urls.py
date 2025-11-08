from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("accounts.urls")),
    path("api/", include("exercises.urls")),
    path("api/programs/", include("programs.urls")),
    path("api/workouts/", include("workouts.urls")),
]
