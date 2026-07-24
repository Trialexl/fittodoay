from __future__ import annotations

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    """Manager that uses email as the unique identifier."""

    def _create_user(self, email: str, password: str | None, **extra_fields):
        if not email:
            raise ValueError("Email address must be provided")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if not extra_fields.get("is_staff"):
            raise ValueError("Superuser must have is_staff=True.")
        if not extra_fields.get("is_superuser"):
            raise ValueError("Superuser must have is_superuser=True.")

        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """Custom user that authenticates via email."""

    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = []

    def __str__(self) -> str:
        return self.email


class UserProfile(models.Model):
    """Extended fitness profile information used for recommendations."""

    class Goal(models.TextChoices):
        CUT = "cut", "Рельеф"
        STRENGTH = "strength", "Сила"
        HYPERTROPHY = "hypertrophy", "Гипертрофия"
        ENDURANCE = "endurance", "Выносливость"

    class Gender(models.TextChoices):
        MALE = "male", "Мужской"
        FEMALE = "female", "Женский"
        OTHER = "other", "Другое"

    class Level(models.TextChoices):
        BEGINNER = "beginner", "Новичок"
        INTERMEDIATE = "intermediate", "Средний"
        ADVANCED = "advanced", "Продвинутый"

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    goal = models.CharField(max_length=32, choices=Goal.choices)
    gender = models.CharField(max_length=16, choices=Gender.choices)
    age = models.PositiveIntegerField()
    weight_kg = models.DecimalField(max_digits=5, decimal_places=2)
    height_cm = models.DecimalField(max_digits=5, decimal_places=2)
    level = models.CharField(max_length=16, choices=Level.choices)
    equipment = models.CharField(max_length=255, help_text="Доступное оборудование")
    health_limitations = models.TextField(blank=True)
    preferred_schedule_notes = models.CharField(
        max_length=255, blank=True, help_text="Дополнительные пожелания к графику"
    )
    llm_preferences = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Profile of {self.user.email}"


class UserFeedback(models.Model):
    """Свободный фидбек от пользователя."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="feedback")
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Feedback {self.id} from {self.user.email}"


# Create your models here.
