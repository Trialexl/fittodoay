from __future__ import annotations

from django.contrib.auth import authenticate
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from .models import User, UserProfile, UserFeedback
from .services import build_ai_prompt


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "date_joined"]
        read_only_fields = fields


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            "goal",
            "gender",
            "age",
            "weight_kg",
            "height_cm",
            "level",
            "equipment",
            "health_limitations",
            "preferred_schedule_notes",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]


class LLMPreferencesSerializer(serializers.Serializer):
    gender = serializers.ChoiceField(
        choices=UserProfile.Gender.choices, required=False, allow_null=True
    )
    age = serializers.IntegerField(min_value=10, max_value=100, required=False, allow_null=True)
    weight_kg = serializers.FloatField(required=False, allow_null=True)
    height_cm = serializers.FloatField(required=False, allow_null=True)
    goal = serializers.ChoiceField(
        choices=UserProfile.Goal.choices, required=False, allow_null=True
    )
    sessions_per_week = serializers.IntegerField(
        min_value=1, max_value=14, required=False, allow_null=True
    )
    session_duration = serializers.IntegerField(
        min_value=10, max_value=180, required=False, allow_null=True
    )
    notes = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=1000
    )

    def to_representation(self, instance):
        base = {field: None for field in self.fields}
        if isinstance(instance, dict):
            for key in base.keys():
                base[key] = instance.get(key)
        return base


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    profile = UserProfileSerializer()

    def validate_email(self, value: str) -> str:
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("Пользователь с таким email уже существует")
        return value

    def create(self, validated_data):
        profile_payload = validated_data.pop("profile")
        user = User.objects.create_user(**validated_data)
        UserProfile.objects.create(user=user, **profile_payload)
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs.get("email")
        password = attrs.get("password")
        user = authenticate(request=self.context.get("request"), email=email, password=password)
        if not user:
            raise serializers.ValidationError(_("Неверный email или пароль"), code="authorization")
        attrs["user"] = user
        return attrs


class PromptPreviewSerializer(serializers.Serializer):
    prompt = serializers.CharField(read_only=True)

    def to_representation(self, instance: UserProfile):
        return {"prompt": build_ai_prompt(instance)}


class UserFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserFeedback
        fields = ["id", "message", "created_at"]
        read_only_fields = ["id", "created_at"]
