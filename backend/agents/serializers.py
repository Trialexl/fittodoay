from __future__ import annotations

from rest_framework import serializers

from accounts.serializers import LLMPreferencesSerializer
from agents.models import LLMProgramMessage, LLMProgramThread
from programs.models import ProgramFolder


class LLMProgramRequestSerializer(LLMPreferencesSerializer):
    """Визард подаёт те же поля, что и сохранённые предпочтения."""

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Заполните хотя бы один параметр")
        return super().validate(attrs)


class LLMProgramResponseSerializer(serializers.Serializer):
    created_programs = serializers.ListField(
        child=serializers.DictField(), read_only=True
    )
    active_program_id = serializers.IntegerField(read_only=True)
    raw_plan = serializers.DictField(read_only=True)


class LLMProgramThreadCreateSerializer(serializers.Serializer):
    program_id = serializers.IntegerField()
    title = serializers.CharField(required=False, allow_blank=True, max_length=200)

    def validate_program_id(self, value: int):
        user = self.context["request"].user
        try:
            program = ProgramFolder.objects.get(id=value, user=user)
        except ProgramFolder.DoesNotExist:
            raise serializers.ValidationError("Программа не найдена")
        self.context["program"] = program
        return value

    def create(self, validated_data):
        program: ProgramFolder = self.context["program"]
        return LLMProgramThread.objects.create(
            user=self.context["request"].user,
            program=program,
            title=validated_data.get("title", "") or program.name,
        )


class LLMProgramThreadSerializer(serializers.ModelSerializer):
    class Meta:
        model = LLMProgramThread
        fields = ["id", "title", "program", "is_closed", "created_at", "updated_at"]
        read_only_fields = fields


class LLMProgramMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = LLMProgramMessage
        fields = ["id", "role", "content", "actions", "proposal_status", "created_at"]
        read_only_fields = fields


class LLMProgramMessageCreateSerializer(serializers.Serializer):
    class Mode:
        PROGRAM_EDIT = "program_edit"
        POST_WORKOUT_REVIEW = "post_workout_review"
        CHOICES = (
            (PROGRAM_EDIT, PROGRAM_EDIT),
            (POST_WORKOUT_REVIEW, POST_WORKOUT_REVIEW),
        )

    message = serializers.CharField()
    mode = serializers.ChoiceField(
        choices=Mode.CHOICES,
        required=False,
        default=Mode.PROGRAM_EDIT,
    )
    workout_date = serializers.DateField(required=False)

    def validate(self, attrs):
        message = attrs.get("message", "").strip()
        if not message:
            raise serializers.ValidationError("Сообщение не может быть пустым")
        return attrs


class LLMProgramActionSerializer(serializers.Serializer):
    message_id = serializers.IntegerField(min_value=1)
    action_index = serializers.IntegerField(min_value=0, required=False)
