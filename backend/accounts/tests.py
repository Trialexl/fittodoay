from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

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
