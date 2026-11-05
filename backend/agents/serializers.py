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

    message = serializers.CharField(max_length=8000)
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


class ProgramEditActionSerializer(serializers.Serializer):
    """Model output is untrusted; constrain every field before displaying a proposal."""

    type = serializers.ChoiceField(
        choices=[
            "add_exercise",
            "replace_exercise",
            "remove_exercise",
            "update_weight",
            "create_custom_exercise",
        ]
    )
    program_id = serializers.IntegerField(required=False, min_value=1)
    day_id = serializers.IntegerField(required=False, min_value=1)
    day_name = serializers.CharField(required=False, max_length=200)
    template_exercise_id = serializers.IntegerField(required=False, min_value=1)
    deactivate_exercise_id = serializers.IntegerField(required=False, min_value=1)
    exercise_id = serializers.CharField(required=False, max_length=120)
    custom_exercise_id = serializers.IntegerField(required=False, min_value=1)
    exercise_name = serializers.CharField(required=False, max_length=255)
    target_muscles = serializers.CharField(required=False, max_length=120)
    description = serializers.CharField(
        required=False, max_length=6000, allow_blank=True
    )
    note = serializers.CharField(required=False, max_length=255, allow_blank=True)
    sets = serializers.IntegerField(required=False, min_value=1, max_value=20)
    reps = serializers.IntegerField(required=False, min_value=1, max_value=1000)
    weight = serializers.FloatField(required=False, min_value=0, max_value=1000)
    time = serializers.IntegerField(required=False, min_value=1, max_value=86400)
    rest = serializers.IntegerField(required=False, min_value=0, max_value=3600)
    has_weight = serializers.BooleanField(required=False)
    has_time = serializers.BooleanField(required=False)
    default_sets = serializers.IntegerField(required=False, min_value=1, max_value=20)
    default_reps = serializers.IntegerField(required=False, min_value=1, max_value=1000)
    default_weight = serializers.FloatField(required=False, min_value=0, max_value=1000)
    default_time = serializers.IntegerField(
        required=False, min_value=1, max_value=86400
    )
    default_rest = serializers.IntegerField(required=False, min_value=0, max_value=3600)

    def to_internal_value(self, data):
        if set(data) - set(self.fields):
            raise serializers.ValidationError(
                {"non_field_errors": ["unknown_action_fields"]}
            )
        if any(
            isinstance(value, bool)
            for key, value in data.items()
            if key not in ("has_weight", "has_time")
        ):
            raise serializers.ValidationError(
                {"non_field_errors": ["invalid_boolean_value"]}
            )
        return super().to_internal_value(data)

    def validate(self, attrs):
        if attrs.get("exercise_id") and attrs.get("custom_exercise_id"):
            raise serializers.ValidationError("ambiguous_exercise_source")
        return attrs
