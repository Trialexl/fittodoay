from django.contrib import admin

from .models import (
    TechniqueReview,
    WorkoutAnalysisRun,
    WorkoutDay,
    WorkoutMusicTrack,
    WorkoutSetLog,
    WorkoutWeighIn,
)


@admin.register(WorkoutDay)
class WorkoutDayAdmin(admin.ModelAdmin):
    list_display = ("user", "date", "status")
    list_filter = ("status",)
    search_fields = ("user__email",)


@admin.register(WorkoutSetLog)
class WorkoutSetLogAdmin(admin.ModelAdmin):
    list_display = ("workout_day", "template_exercise", "set_index", "actual_reps")
    search_fields = ("workout_day__user__email",)


@admin.register(WorkoutWeighIn)
class WorkoutWeighInAdmin(admin.ModelAdmin):
    list_display = ("user", "date", "weight_kg", "created_at")
    list_filter = ("date",)
    search_fields = ("user__email",)


@admin.register(WorkoutMusicTrack)
class WorkoutMusicTrackAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "display_name",
        "artist",
        "album",
        "title",
        "owner",
        "file",
        "stream_url",
        "stream_category",
        "is_active",
        "created_at",
    )
    list_filter = ("is_active", "stream_category", "owner", "created_at")
    search_fields = (
        "artist",
        "album",
        "title",
        "file",
        "stream_url",
        "owner__email",
    )
    readonly_fields = ("created_at", "updated_at")


@admin.register(TechniqueReview)
class TechniqueReviewAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "exercise",
        "status",
        "score",
        "detected_exercise_confidence",
        "error_code",
        "created_at",
    )
    list_filter = ("status", "error_code", "created_at")
    search_fields = (
        "user__email",
        "exercise__name_ru",
        "exercise__name_en",
        "detected_exercise_name",
    )
    readonly_fields = ("created_at", "updated_at")


# Register your models here.


@admin.register(WorkoutAnalysisRun)
class WorkoutAnalysisRunAdmin(admin.ModelAdmin):
    list_display = ("workout_day", "program", "version", "mode", "updated_at")
    list_filter = ("mode", "version")
    readonly_fields = (
        "workout_day",
        "program",
        "version",
        "mode",
        "report",
        "legacy_recommendations",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
