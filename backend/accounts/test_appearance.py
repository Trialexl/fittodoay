import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from accounts.models import UserProfile


@pytest.fixture
def account():
    user = get_user_model().objects.create_user(
        email="appearance@example.com", password="pass"
    )
    UserProfile.objects.create(
        user=user,
        goal="strength",
        gender="male",
        age=30,
        weight_kg=80,
        height_cm=180,
        level="beginner",
        equipment="dumbbells",
        llm_preferences={
            "sessions_per_week": 3,
            "theme": "dark",
            "accent_color": "#22c55e",
        },
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return user, client


@pytest.mark.django_db
def test_music_grouping_defaults_persists_and_preserves_other_preferences(account):
    user, client = account
    assert client.get("/api/profile/preferences/").data["music_group_by"] == "folder"
    for grouping in ("none", "artist", "album", "folder"):
        response = client.put(
            "/api/profile/preferences/", {"music_group_by": grouping}, format="json"
        )
        assert response.status_code == 200
        new_session = APIClient()
        new_session.force_authenticate(user=type(user).objects.get(pk=user.pk))
        assert new_session.get("/api/profile/preferences/").data["music_group_by"] == grouping
        user.profile.refresh_from_db()
        assert user.profile.llm_preferences["sessions_per_week"] == 3
        assert user.profile.llm_preferences["theme"] == "dark"
    response = client.put(
        "/api/profile/preferences/", {"music_group_by": "invalid"}, format="json"
    )
    assert response.status_code == 400
    assert client.get("/api/profile/preferences/").data["music_group_by"] == "folder"


@pytest.mark.django_db
def test_muscle_summary_defaults_persists_and_preserves_other_preferences(account):
    user, client = account
    assert client.get("/api/profile/preferences/").data["muscle_summary_view"] == "chips"
    for mode in ("bars", "row", "chips"):
        response = client.put(
            "/api/profile/preferences/", {"muscle_summary_view": mode}, format="json"
        )
        assert response.status_code == 200
        assert response.data["muscle_summary_view"] == mode
        new_session = APIClient()
        new_session.force_authenticate(user=type(user).objects.get(pk=user.pk))
        assert new_session.get("/api/profile/preferences/").data["muscle_summary_view"] == mode
        client.put("/api/profile/preferences/", {"theme": "light"}, format="json")
        user.profile.refresh_from_db()
        assert user.profile.llm_preferences["muscle_summary_view"] == mode
        assert user.profile.llm_preferences["sessions_per_week"] == 3


@pytest.mark.django_db
@pytest.mark.parametrize("invalid", ["other", "", None, 2])
def test_invalid_muscle_summary_does_not_change_preferences(account, invalid):
    user, client = account
    response = client.put(
        "/api/profile/preferences/", {"muscle_summary_view": invalid}, format="json"
    )
    assert response.status_code == 400
    user.profile.refresh_from_db()
    assert "muscle_summary_view" not in user.profile.llm_preferences



@pytest.mark.django_db
def test_design_defaults_to_classic_and_persists_across_sessions(account):
    user, client = account
    assert client.get("/api/profile/preferences/").data["design_version"] == "v1"
    response = client.put(
        "/api/profile/preferences/", {"design_version": "v2"}, format="json"
    )
    assert response.status_code == 200
    user.profile.refresh_from_db()
    assert user.profile.llm_preferences == {
        "sessions_per_week": 3,
        "theme": "dark",
        "accent_color": "#22c55e",
        "design_version": "v2",
    }
    new_session = APIClient()
    new_session.force_authenticate(user=user)
    assert new_session.get("/api/profile/preferences/").data["design_version"] == "v2"
    client.put("/api/profile/preferences/", {"theme": "light"}, format="json")
    assert client.get("/api/profile/preferences/").data["design_version"] == "v2"
    response = client.put(
        "/api/profile/preferences/", {"design_version": "v1"}, format="json"
    )
    assert response.data["design_version"] == "v1"


@pytest.mark.django_db
@pytest.mark.parametrize("invalid", ["v3", "", None, 2])
def test_invalid_design_does_not_change_preferences(account, invalid):
    user, client = account
    response = client.put(
        "/api/profile/preferences/", {"design_version": invalid}, format="json"
    )
    assert response.status_code == 400
    user.profile.refresh_from_db()
    assert "design_version" not in user.profile.llm_preferences


@pytest.mark.django_db
def test_design_requires_authentication_and_is_isolated_per_user(account):
    user, client = account
    other = get_user_model().objects.create_user(
        email="appearance-other@example.com", password="pass"
    )
    UserProfile.objects.create(
        user=other,
        goal="strength",
        gender="male",
        age=30,
        weight_kg=80,
        height_cm=180,
        level="beginner",
        equipment="none",
    )
    client.put("/api/profile/preferences/", {"design_version": "v2"}, format="json")
    client.force_authenticate(user=other)
    assert client.get("/api/profile/preferences/").data["design_version"] == "v1"
    anonymous = APIClient()
    assert anonymous.put(
        "/api/profile/preferences/", {"design_version": "v2"}, format="json"
    ).status_code in (401, 403)
