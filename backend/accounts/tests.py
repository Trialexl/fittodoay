from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from accounts.models import UserProfile

User = get_user_model()


@pytest.mark.django_db
def test_login_ignores_existing_session_csrf_requirement():
    session_user = User.objects.create_user(
        email="session@example.com",
        password="session-password",
    )
    login_user = User.objects.create_user(
        email="login@example.com",
        password="login-password",
    )
    client = APIClient(enforce_csrf_checks=True)
    assert client.login(email=session_user.email, password="session-password")

    response = client.post(
        "/api/auth/login/",
        {"email": login_user.email, "password": "login-password"},
        format="json",
    )

    assert response.status_code == 200, response.content
    assert response.data["user"]["email"] == login_user.email
    assert response.data["token"]


@pytest.mark.django_db
def test_token_authenticated_preference_update_does_not_require_session_csrf():
    user = User.objects.create_user(
        email="preferences@example.com",
        password="preferences-password",
    )
    UserProfile.objects.create(
        user=user,
        goal=UserProfile.Goal.STRENGTH,
        gender=UserProfile.Gender.MALE,
        age=30,
        weight_kg=80,
        height_cm=180,
        level=UserProfile.Level.BEGINNER,
        equipment="dumbbells",
    )
    client = APIClient(enforce_csrf_checks=True)

    login_response = client.post(
        "/api/auth/login/",
        {"email": user.email, "password": "preferences-password"},
        format="json",
    )
    assert login_response.status_code == 200, login_response.content

    client.credentials(
        HTTP_AUTHORIZATION=f"Token {login_response.data['token']}"
    )
    response = client.put(
        "/api/profile/preferences/",
        {"theme": "dark", "accent_color": "#a855f7"},
        format="json",
    )

    assert response.status_code == 200, response.content
    assert response.data["theme"] == "dark"
