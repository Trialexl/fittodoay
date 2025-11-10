from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import LLMPreferencesSerializer
from decimal import Decimal

from agents.serializers import LLMProgramRequestSerializer, LLMProgramResponseSerializer
from agents.services import (
    FALLBACK_MESSAGE,
    LLMInvalidResponse,
    LLMProgramGenerationService,
    LLMServiceError,
    LLMUnavailableError,
)

logger = logging.getLogger(__name__)


class LLMProgramView(APIView):
    """Создание программ через LLM-агента."""

    request_serializer = LLMProgramRequestSerializer
    response_serializer = LLMProgramResponseSerializer
    preferences_serializer = LLMPreferencesSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.request_serializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        profile = request.user.profile
        existing = self._normalize(profile.llm_preferences)
        incoming = self._normalize(serializer.validated_data)
        merged_preferences = {**existing, **incoming}
        profile.llm_preferences = merged_preferences
        profile.save(update_fields=["llm_preferences"])

        try:
            service = LLMProgramGenerationService(user=request.user)
            result = service.generate(merged_preferences)
        except LLMUnavailableError:
            logger.info("LLM unavailable for user %s", request.user.id)
            return Response(
                {"detail": "assistant_unavailable", "message": FALLBACK_MESSAGE},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except LLMInvalidResponse as exc:
            logger.warning("LLM returned invalid data for user %s: %s", request.user.id, exc)
            return Response(
                {"detail": "assistant_invalid_response", "message": FALLBACK_MESSAGE},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except LLMServiceError as exc:  # pragma: no cover
            logger.error("LLM service error for user %s: %s", request.user.id, exc)
            return Response(
                {"detail": "assistant_error", "message": FALLBACK_MESSAGE},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        response = self.response_serializer(result)
        return Response(response.data, status=status.HTTP_201_CREATED)

    def _normalize(self, data):
        normalized = {}
        for key, value in (data or {}).items():
            if isinstance(value, Decimal):
                normalized[key] = float(value)
            else:
                normalized[key] = value
        return normalized
