from django.contrib import admin

from .models import CustomExercise, Exercise


@admin.register(Exercise)
class ExerciseAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "target_muscles",
        "has_weight",
        "has_time",
        "default_reps",
        "default_sets",
    )
    search_fields = ("name", "target_muscles")
    list_filter = ("has_weight", "has_time")


@admin.register(CustomExercise)
class CustomExerciseAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "target_muscles", "has_weight", "has_time")
    search_fields = ("name", "user__email", "target_muscles")
    list_filter = ("has_weight", "has_time")

# Register your models here.
