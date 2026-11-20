import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_custom_collection_is_not_shadowed_by_catalog_detail():
    client = APIClient()
    user = get_user_model().objects.create_user(email="custom-route@example.test")
    client.force_authenticate(user=user)
    assert client.get("/api/exercises/custom/").status_code == 200
    created = client.post(
        "/api/exercises/custom/",
        {
            "name": "Route regression",
            "target_muscles": "Biceps",
            "has_weight": True,
            "has_time": False,
        },
        format="json",
    )
    assert created.status_code == 201, created.data
    path = f"/api/exercises/custom/{created.data['id']}/"
    assert client.get(path).data["name"] == "Route regression"
    assert client.patch(path, {"name": "Updated"}, format="json").status_code == 200
    assert client.get("/api/exercises/custom/").data[0]["name"] == "Updated"
    other = get_user_model().objects.create_user(email="other-route@example.test")
    client.force_authenticate(user=other)
    assert client.get(path).status_code == 404
    assert client.get("/api/exercises/custom/").data == []
    client.force_authenticate(user=user)
    assert client.delete(path).status_code == 204
