from django.contrib import admin

from .models import DayTemplate, ProgramFolder, TemplateExercise


class TemplateExerciseInline(admin.TabularInline):
    model = TemplateExercise
    extra = 0


@admin.register(ProgramFolder)
class ProgramFolderAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "is_active", "sort_order")
    list_filter = ("is_active",)
    search_fields = ("name", "user__email")


@admin.register(DayTemplate)
class DayTemplateAdmin(admin.ModelAdmin):
    list_display = ("name", "folder", "schedule_type", "is_active", "sort_order")
    list_filter = ("schedule_type", "is_active")
    search_fields = ("name", "folder__name")
    inlines = [TemplateExerciseInline]

# Register your models here.
