"""
Django settings for fitTODOay backend.

These settings are intentionally minimal – feature apps will be added iteratively.
"""

from __future__ import annotations

import os
from pathlib import Path

from django.core.management.utils import get_random_secret_key

BASE_DIR = Path(__file__).resolve().parent.parent

# Core security
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", get_random_secret_key())
DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() == "true"
def split_env_list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


ALLOWED_HOSTS = split_env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")

# Applications
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework.authtoken",
    "accounts",
    "agents",
    "exercises",
    "programs",
    "workouts",
    "analytics",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "fittodoey_backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "fittodoey_backend.wsgi.application"
ASGI_APPLICATION = "fittodoey_backend.asgi.application"

# Database (Postgres by default)
DEFAULT_DB_ENGINE = os.environ.get("DJANGO_DB_ENGINE", "django.db.backends.sqlite3")
if DEFAULT_DB_ENGINE == "django.db.backends.sqlite3":
    DATABASES = {
        "default": {
            "ENGINE": DEFAULT_DB_ENGINE,
            "NAME": os.environ.get("DJANGO_DB_NAME", BASE_DIR / "db.sqlite3"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": DEFAULT_DB_ENGINE,
            "NAME": os.environ.get("DJANGO_DB_NAME", "fittodoey"),
            "USER": os.environ.get("DJANGO_DB_USER", "fittodoey"),
            "PASSWORD": os.environ.get("DJANGO_DB_PASSWORD", "fittodoey"),
            "HOST": os.environ.get("DJANGO_DB_HOST", "localhost"),
            "PORT": os.environ.get("DJANGO_DB_PORT", "5432"),
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "ru-ru"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
STATICFILES_DIRS: list[Path] = []
EXERCISES_STATIC_DIR = BASE_DIR.parent / "docs" / "exercises"
if EXERCISES_STATIC_DIR.exists():
    STATICFILES_DIRS.append(EXERCISES_STATIC_DIR)

MEDIA_URL = "media/"
MEDIA_ROOT = Path(os.environ.get("DJANGO_MEDIA_ROOT", BASE_DIR / "media"))
MUSIC_ROOT = Path(os.environ.get("DJANGO_MUSIC_ROOT", BASE_DIR.parent / "music"))
MUSIC_UPLOAD_MAX_MB = int(os.environ.get("DJANGO_MUSIC_UPLOAD_MAX_MB", "130"))
TECHNIQUE_VIDEO_MAX_MB = int(os.environ.get("DJANGO_TECHNIQUE_VIDEO_MAX_MB", "80"))
TECHNIQUE_VIDEO_MAX_SECONDS = int(
    os.environ.get("DJANGO_TECHNIQUE_VIDEO_MAX_SECONDS", "30")
)
TECHNIQUE_ANALYSIS_TIMEOUT_SECONDS = int(
    os.environ.get("DJANGO_TECHNIQUE_ANALYSIS_TIMEOUT_SECONDS", "45")
)
TECHNIQUE_ANALYSIS_MODE = os.environ.get("DJANGO_TECHNIQUE_ANALYSIS_MODE", "sync")
TECHNIQUE_VIDEO_RETENTION_DAYS = int(
    os.environ.get("DJANGO_TECHNIQUE_VIDEO_RETENTION_DAYS", "30")
)
TECHNIQUE_REVIEW_DAILY_LIMIT = int(
    os.environ.get("DJANGO_TECHNIQUE_REVIEW_DAILY_LIMIT", "10")
)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# REST Framework defaults
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
        "rest_framework.authentication.TokenAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

AUTH_USER_MODEL = "accounts.User"

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = split_env_list(
    "DJANGO_CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
)
CSRF_TRUSTED_ORIGINS = split_env_list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    ",".join(CORS_ALLOWED_ORIGINS),
)
