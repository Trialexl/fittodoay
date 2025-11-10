from django.urls import path

from .views import LLMProgramView

app_name = "agents"

urlpatterns = [
    path("llm-agent/programs/", LLMProgramView.as_view(), name="llm-programs"),
]
