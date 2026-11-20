import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from agents.models import LLMProgramMessage, LLMProgramThread
from programs.models import ProgramFolder


@pytest.mark.django_db
def test_complete_thread_archive_is_private_and_preserves_post():
    owner = get_user_model().objects.create_user(email="archive@example.test")
    other = get_user_model().objects.create_user(email="foreign@example.test")
    program = ProgramFolder.objects.create(user=owner, name="Archive")
    second = ProgramFolder.objects.create(user=owner, name="Second")
    foreign = ProgramFolder.objects.create(user=other, name="Private")
    hidden = LLMProgramThread.objects.create(user=other, program=foreign)
    wanted = [
        LLMProgramThread.objects.create(
            user=owner, program=program, is_closed=i == 0
        ).id
        for i in range(5)
    ]
    LLMProgramThread.objects.create(user=owner, program=second)
    client = APIClient()
    assert client.get("/api/llm-agent/threads/").status_code in (401, 403)
    client.force_authenticate(owner)
    path = f"/api/llm-agent/threads/?program_id={program.pk}&limit=2"
    found = []
    while path:
        response = client.get(path)
        assert response.status_code == 200
        found += [item["id"] for item in response.data["items"]]
        path = response.data["next"]
        assert path is None or path.startswith("/api/llm-agent/threads/")
    assert found == list(reversed(wanted))
    assert client.get("/api/llm-agent/threads/?program_id=bad").status_code == 400
    assert (
        client.get(f"/api/llm-agent/threads/?program_id={foreign.pk}").data["items"]
        == []
    )
    assert (
        client.get(f"/api/llm-agent/threads/{hidden.pk}/messages/").status_code == 404
    )
    message = LLMProgramMessage.objects.create(
        thread_id=wanted[0], role="user", content="Saved message"
    )
    assert (
        client.get(f"/api/llm-agent/threads/{wanted[0]}/messages/").data[0]["id"]
        == message.pk
    )
    created = client.post(
        "/api/llm-agent/threads/", {"program_id": program.pk}, format="json"
    )
    assert created.status_code == 201
    assert created.data["program"] == program.pk
    assert created.data["id"] not in wanted
