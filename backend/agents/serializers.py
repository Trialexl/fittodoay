from __future__ import annotations

from rest_framework import serializers

from accounts.serializers import LLMPreferencesSerializer


class LLMProgramRequestSerializer(LLMPreferencesSerializer):
    """Визард подаёт те же поля, что и сохранённые предпочтения."""

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Заполните хотя бы один параметр")
        return super().validate(attrs)


class LLMProgramResponseSerializer(serializers.Serializer):
    created_programs = serializers.ListField(child=serializers.DictField(), read_only=True)
    active_program_id = serializers.IntegerField(read_only=True)
    raw_plan = serializers.DictField(read_only=True)
