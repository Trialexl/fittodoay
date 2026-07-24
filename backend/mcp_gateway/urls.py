from django.urls import path

from .views import SessionBootstrapView

urlpatterns = [
    path(
        "auth/session-bootstrap/",
        SessionBootstrapView.as_view(),
        name="session-bootstrap",
    ),
]
