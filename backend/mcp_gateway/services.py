from __future__ import annotations

from types import SimpleNamespace

from django.db import transaction
from programs.models import DayTemplate
from programs.serializers import DayTemplateSerializer, ProgramFolderSerializer

from .models import MCPIdempotencyRecord


@transaction.atomic
def create_training_program(*, user, payload: dict, idempotency_key: str) -> dict:
    existing = MCPIdempotencyRecord.objects.filter(
        user=user, operation="create_training_program", key=idempotency_key
    ).first()
    if existing:
        return existing.response
    request = SimpleNamespace(user=user)
    program_data = dict(payload)
    days = program_data.pop("days", [])
    serializer = ProgramFolderSerializer(
        data=program_data, context={"request": request}
    )
    serializer.is_valid(raise_exception=True)
    folder = serializer.save(user=user)
    for day_data in days:
        day_payload = dict(day_data)
        day_payload["folder"] = folder.id
        day_serializer = DayTemplateSerializer(
            data=day_payload, context={"request": request}
        )
        day_serializer.is_valid(raise_exception=True)
        day_serializer.save()
    response = {
        **ProgramFolderSerializer(folder).data,
        "days": DayTemplateSerializer(
            DayTemplate.objects.filter(folder=folder), many=True
        ).data,
    }
    MCPIdempotencyRecord.objects.create(
        user=user,
        operation="create_training_program",
        key=idempotency_key,
        response=response,
    )
    return response
