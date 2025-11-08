from django.urls import path

from .views import LoginView, ProfileView, PromptPreviewView, RegisterView

app_name = "accounts"

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/login/", LoginView.as_view(), name="login"),
    path("profile/", ProfileView.as_view(), name="profile"),
    path("profile/prompt/", PromptPreviewView.as_view(), name="prompt-preview"),
]
