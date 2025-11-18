from __future__ import annotations

from django.conf import settings
from django.db import models

User = settings.AUTH_USER_MODEL


class TimestampedModel(models.Model):
  created_at = models.DateTimeField(auto_now_add=True)
  updated_at = models.DateTimeField(auto_now=True)

  class Meta:
      abstract = True


class LLMRequestLog(TimestampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="llm_requests")
    payload = models.JSONField()
    response = models.JSONField(null=True, blank=True)
    status = models.CharField(max_length=64)
    success = models.BooleanField(default=False)
    error_message = models.TextField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"LLM request ({self.user_id}) — {self.status}"
