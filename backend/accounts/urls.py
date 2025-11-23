from django.urls import path

from .views import (
    LLMPreferencesView,
    LoginView,
    ProfileView,
    PromptPreviewView,
    RegisterView,
    UserFeedbackView,
)

app_name = "accounts"

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("profile/prompt/", PromptPreviewView.as_view(), name="prompt-preview"),
    path("profile/preferences/", LLMPreferencesView.as_view(), name="llm-preferences"),
    path("feedback/", UserFeedbackView.as_view(), name="feedback"),
]
