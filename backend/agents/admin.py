from django.contrib import admin

from agents.models import LLMRequestLog


@admin.register(LLMRequestLog)
class LLMRequestLogAdmin(admin.ModelAdmin):
    list_display = ("user", "status", "success", "created_at")
    list_filter = ("success", "status", "created_at")
    search_fields = ("user__email", "status", "error_message")
    readonly_fields = ("created_at", "updated_at")
