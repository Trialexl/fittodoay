from django.contrib import admin

from .models import WorkoutDay, WorkoutMusicTrack, WorkoutSetLog, WorkoutWeighIn


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
    list_display = ("id", "display_name", "artist", "album", "title", "owner", "file", "is_active", "created_at")
    list_filter = ("is_active", "owner", "created_at")
    search_fields = ("artist", "album", "title", "file", "owner__email")
    readonly_fields = ("created_at", "updated_at")

# Register your models here.
