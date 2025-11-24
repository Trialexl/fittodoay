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


class LLMProgramThread(TimestampedModel):
    """Диалог вокруг конкретной программы."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="llm_threads")
    program = models.ForeignKey(
        "programs.ProgramFolder",
        on_delete=models.CASCADE,
        related_name="llm_threads",
    )
    title = models.CharField(max_length=200, blank=True)
    is_closed = models.BooleanField(default=False)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"Thread {self.id} for program {self.program_id}"


class LLMProgramMessage(TimestampedModel):
    """Сообщение в чате по программе."""

    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"

    thread = models.ForeignKey(
        LLMProgramThread,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=16, choices=Role.choices)
    content = models.TextField()
    actions = models.JSONField(blank=True, null=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.role} message {self.id} in thread {self.thread_id}"
