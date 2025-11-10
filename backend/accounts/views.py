from __future__ import annotations

from django.contrib.auth import login
from rest_framework import generics, permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserProfile
from .serializers import (
    LoginSerializer,
    LLMPreferencesSerializer,
    PromptPreviewSerializer,
    RegisterSerializer,
    UserProfileSerializer,
    UserSerializer,
)


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {"user": UserSerializer(user).data, "token": token.key},
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        login(request, user)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": UserSerializer(user).data})


class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserProfileSerializer

    def get_object(self) -> UserProfile:
        return self.request.user.profile


class PromptPreviewView(APIView):
    def get(self, request, *args, **kwargs):
        profile = request.user.profile
        serializer = PromptPreviewSerializer().to_representation(profile)
        return Response(serializer)


class LLMPreferencesView(APIView):
    serializer_class = LLMPreferencesSerializer

    def get(self, request, *args, **kwargs):
        profile = request.user.profile
        data = self._with_defaults(profile.llm_preferences)
        serializer = self.serializer_class(instance=data)
        return Response(serializer.data)

    def put(self, request, *args, **kwargs):
        profile = request.user.profile
        serializer = self.serializer_class(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        preferences = profile.llm_preferences or {}
        preferences.update(serializer.validated_data)
        profile.llm_preferences = preferences
        profile.save(update_fields=["llm_preferences"])
        response_serializer = self.serializer_class(instance=self._with_defaults(preferences))
        return Response(response_serializer.data)

    def _with_defaults(self, data: dict | None):
        serializer = self.serializer_class()
        defaults = {field_name: None for field_name in serializer.fields.keys()}
        defaults.update(data or {})
        return defaults

# Create your views here.
