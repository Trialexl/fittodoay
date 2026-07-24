from django.urls import path

from .views import consent

urlpatterns = [path("consent/", consent, name="mcp-consent")]
