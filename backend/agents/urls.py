from django.urls import path

from .views import (
    LLMProgramApplyView,
    LLMProgramCancelView,
    LLMProgramMessageView,
    LLMProgramThreadView,
    LLMProgramView,
)

app_name = "agents"

urlpatterns = [
    path("llm-agent/programs/", LLMProgramView.as_view(), name="llm-programs"),
    path(
        "llm-agent/threads/", LLMProgramThreadView.as_view(), name="llm-thread-create"
    ),
    path(
        "llm-agent/threads/<int:pk>/messages/",
        LLMProgramMessageView.as_view(),
        name="llm-thread-messages",
    ),
    path(
        "llm-agent/threads/<int:pk>/apply/",
        LLMProgramApplyView.as_view(),
        name="llm-thread-apply",
    ),
    path(
        "llm-agent/threads/<int:pk>/cancel/",
        LLMProgramCancelView.as_view(),
        name="llm-thread-cancel",
    ),
]
