from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import generics, permissions
from rest_framework.exceptions import NotFound

from accounts.serializers import LLMPreferencesSerializer
from decimal import Decimal

from agents.serializers import (
    LLMProgramActionSerializer,
    LLMProgramMessageCreateSerializer,
    LLMProgramMessageSerializer,
    LLMProgramRequestSerializer,
    LLMProgramResponseSerializer,
    LLMProgramThreadCreateSerializer,
    LLMProgramThreadSerializer,
)
from agents.services import (
    FALLBACK_MESSAGE,
    LLMInvalidResponse,
    LLMProgramGenerationService,
    LLMProgramChatService,
    LLMServiceError,
    LLMUnavailableError,
)
from agents.models import LLMProgramThread

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


class LLMProgramThreadView(generics.CreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = LLMProgramThreadCreateSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        thread = serializer.save()
        return Response(LLMProgramThreadSerializer(thread).data, status=status.HTTP_201_CREATED)


class LLMProgramMessageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_thread(self, pk) -> LLMProgramThread:
        try:
            return LLMProgramThread.objects.get(id=pk, user=self.request.user)
        except LLMProgramThread.DoesNotExist:
            raise NotFound("thread_not_found")

    def get(self, request, pk: int, *args, **kwargs):
        thread = self.get_thread(pk)
        messages = thread.messages.order_by("created_at", "id")
        return Response(LLMProgramMessageSerializer(messages, many=True).data)

    def post(self, request, pk: int, *args, **kwargs):
        thread = self.get_thread(pk)
        serializer = LLMProgramMessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = LLMProgramChatService(thread)
        try:
            assistant_message = service.send(serializer.validated_data["message"])
        except LLMUnavailableError:
            return Response(
                {
                    "detail": "assistant_unavailable",
                    "message": "Ассистент временно недоступен. Попробуйте повторить запрос позже.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except LLMInvalidResponse:
            return Response(
                {
                    "detail": "assistant_invalid_response",
                    "message": "Ассистент вернул некорректный ответ. Попробуйте переформулировать запрос.",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except LLMServiceError:
            return Response(
                {
                    "detail": "assistant_error",
                    "message": "Ошибка сервиса ассистента. Попробуйте позже.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {
                "assistant": LLMProgramMessageSerializer(assistant_message).data,
            },
            status=status.HTTP_201_CREATED,
        )


class LLMProgramApplyView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int, *args, **kwargs):
        try:
            thread = LLMProgramThread.objects.get(id=pk, user=request.user)
        except LLMProgramThread.DoesNotExist:
            return Response({"detail": "thread_not_found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = LLMProgramActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = LLMProgramChatService(thread)
        try:
            results = service.apply_actions(serializer.validated_data["message_id"])
        except LLMInvalidResponse as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"applied": results}, status=status.HTTP_200_OK)


class LLMProgramCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int, *args, **kwargs):
        try:
            thread = LLMProgramThread.objects.get(id=pk, user=request.user)
        except LLMProgramThread.DoesNotExist:
            return Response({"detail": "thread_not_found"}, status=status.HTTP_404_NOT_FOUND)
        serializer = LLMProgramActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = LLMProgramChatService(thread)
        try:
            result = service.cancel_actions(serializer.validated_data["message_id"])
        except LLMInvalidResponse as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_200_OK)
