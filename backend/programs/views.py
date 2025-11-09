from __future__ import annotations

from rest_framework import permissions, viewsets
from rest_framework.exceptions import ValidationError

from django.shortcuts import get_object_or_404

from .models import DayTemplate, ProgramFolder, TemplateExercise
from .serializers import (
    DayTemplateSerializer,
    ProgramFolderSerializer,
    TemplateExerciseSerializer,
)


class BaseUserQuerysetMixin:
    """Restrict queryset to current user."""

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.filter(user=self.request.user)


class ProgramFolderViewSet(BaseUserQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = ProgramFolderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ProgramFolder.objects.filter(user=self.request.user).order_by("sort_order", "id")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class DayTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = DayTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = DayTemplate.objects.select_related("folder").filter(folder__user=user)
        folder_id = self.request.query_params.get("folder")
        if folder_id:
            queryset = queryset.filter(folder_id=folder_id)
        return queryset.order_by("sort_order", "id")

    def perform_create(self, serializer):
        folder = serializer.validated_data["folder"]
        if folder.user != self.request.user:
            raise permissions.PermissionDenied("Нельзя добавлять шаблон в чужую папку")
        serializer.save()

    def perform_update(self, serializer):
        folder = serializer.validated_data.get("folder")
        if folder and folder.user != self.request.user:
            raise permissions.PermissionDenied("Нельзя перемещать шаблон в чужую папку")
        serializer.save()


class TemplateExerciseViewSet(viewsets.ModelViewSet):
    serializer_class = TemplateExerciseSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = TemplateExercise.objects.filter(template__folder__user=self.request.user)
        template_id = self.request.query_params.get("template")
        if template_id:
            qs = qs.filter(template_id=template_id)
        return qs.order_by("sort_order", "id")

    def _resolve_template(self, serializer, *, allow_missing: bool = False) -> DayTemplate | None:
        template = serializer.validated_data.get("template")
        if template:
            if template.folder.user != self.request.user:
                raise permissions.PermissionDenied("Нельзя изменять чужой шаблон")
            return template
        template_id = self.request.data.get("template")
        if not template_id:
            if allow_missing:
                return None
            raise ValidationError({"template": "Не указан шаблон дня"})
        try:
            template_id = int(template_id)
        except (TypeError, ValueError):
            raise ValidationError({"template": "Некорректный идентификатор шаблона"})
        template = get_object_or_404(
            DayTemplate, pk=template_id, folder__user=self.request.user
        )
        return template

    def perform_create(self, serializer):
        template = self._resolve_template(serializer)
        serializer.save(template=template)

    def perform_update(self, serializer):
        template = self._resolve_template(serializer, allow_missing=True) or serializer.instance.template
        serializer.save(template=template)

# Create your views here.
