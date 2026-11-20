import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from workouts.models import TechniqueReview


@pytest.fixture
def video_archive(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    owner = get_user_model().objects.create_user(email="video@example.test")
    other = get_user_model().objects.create_user(email="video-other@example.test")
    review = TechniqueReview.objects.create(
        user=owner,
        video_file=SimpleUploadedFile(
            "original.mp4", b"0123456789", content_type="video/mp4"
        ),
    )
    return owner, other, review


@pytest.mark.django_db
def test_video_bytes_ranges_and_ownership(video_archive):
    owner, other, review = video_archive
    client = APIClient()
    path = f"/api/technique-reviews/{review.pk}/video/"
    assert client.get(path).status_code in (401, 403)
    client.force_authenticate(other)
    assert client.get(path).status_code == 404
    client.force_authenticate(owner)
    assert client.get(f"/api/technique-reviews/{review.pk}/").data["video_url"] == path
    response = client.get(path)
    assert response.status_code == 200
    assert b"".join(response.streaming_content) == b"0123456789"
    assert response["Content-Type"] == "video/mp4"
    assert response["Cache-Control"] == "private, no-store"
    for value, expected, interval in [
        ("bytes=2-5", b"2345", "bytes 2-5/10"),
        ("bytes=-3", b"789", "bytes 7-9/10"),
    ]:
        response = client.get(path, HTTP_RANGE=value)
        assert response.status_code == 206
        assert b"".join(response.streaming_content) == expected
        assert response["Content-Range"] == interval
    assert client.get(path, HTTP_RANGE="bytes=100-").status_code == 416
    review.video_file.delete(save=False)
    assert client.get(path).status_code == 404


@pytest.mark.django_db
def test_all_reviews_are_paginated_and_private(video_archive):
    owner, other, review = video_archive
    TechniqueReview.objects.bulk_create(
        [TechniqueReview(user=owner, video_file="") for _ in range(24)]
    )
    hidden = TechniqueReview.objects.create(user=other, video_file="")
    client = APIClient()
    client.force_authenticate(owner)
    path = "/api/technique-reviews/"
    found = []
    while path:
        response = client.get(path)
        assert response.status_code == 200
        found += [item["id"] for item in response.data["items"]]
        path = response.data["next"]
        assert path is None or path.startswith("/api/technique-reviews/")
    assert len(found) == len(set(found)) == 25
    assert hidden.pk not in found
    assert review.pk in found
    assert client.delete(f"/api/technique-reviews/{review.pk}/").status_code == 204
    assert client.get(f"/api/technique-reviews/{review.pk}/video/").status_code == 404
