from django.contrib import admin

from workouts.models import Exercise_DB

from .models import CustomExercise


@admin.register(Exercise_DB)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = (
        "name_ru",
        "name_en",
        "has_weight",
        "has_time",
        "default_reps",
        "default_sets",
    )
    search_fields = ("name_ru", "name_en")
    list_filter = ("has_weight", "has_time", "category_ru")


@admin.register(CustomExercise)
class CustomExerciseAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "target_muscles", "has_weight", "has_time")
    search_fields = ("name", "user__email", "target_muscles")
    list_filter = ("has_weight", "has_time")


# Register your models here.
