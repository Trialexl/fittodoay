from django.urls import path

from .views import (
    LLMProgramApplyView,
    LLMProgramCancelView,
    LLMProgramMessageView,
    LLMProgramThreadView,
    LLMProgramView,
    LLMProgramPreviewView,
    LLMProgramDraftApplyView,
)

app_name = "agents"

urlpatterns = [
    path(
        "llm-agent/programs/preview/",
        LLMProgramPreviewView.as_view(),
        name="llm-program-preview",
    ),
    path(
        "llm-agent/programs/drafts/<uuid:draft_id>/apply/",
        LLMProgramDraftApplyView.as_view(),
        name="llm-program-draft-apply",
    ),
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
