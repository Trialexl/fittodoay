# syntax=docker/dockerfile:1
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

ARG INSTALL_DEV_DEPS=true

RUN set -eux; \
    packages="ffmpeg"; \
    if [ "$INSTALL_DEV_DEPS" = "true" ]; then \
        packages="build-essential libpq-dev ffmpeg"; \
    fi; \
    apt-get update -o Acquire::Retries=5; \
    if ! apt-get install -y --no-install-recommends --fix-missing -o Acquire::Retries=5 $packages; then \
        sed -i \
            -e 's|http://deb.debian.org/debian-security|http://security.debian.org/debian-security|g' \
            -e 's|http://deb.debian.org/debian|http://ftp.us.debian.org/debian|g' \
            /etc/apt/sources.list.d/debian.sources; \
        rm -rf /var/lib/apt/lists/*; \
        apt-get update -o Acquire::Retries=5; \
        apt-get install -y --no-install-recommends --fix-missing -o Acquire::Retries=5 $packages; \
    fi; \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
COPY backend/requirements-dev.txt ./requirements-dev.txt
COPY pyproject.toml ./pyproject.toml
RUN pip install --upgrade pip \
    && if [ "$INSTALL_DEV_DEPS" = "true" ]; then \
        pip install -r requirements.txt -r requirements-dev.txt; \
      else \
        pip install -r requirements.txt; \
      fi

COPY backend /app
COPY docs/exercises /docs/exercises

RUN mkdir -p /data
VOLUME ["/data"]

COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DJANGO_SETTINGS_MODULE=fittodoey_backend.settings \
    DJANGO_DB_ENGINE=django.db.backends.sqlite3 \
    DJANGO_DB_NAME=/data/db.sqlite3 \
    PORT=8000 \
    IMPORT_EXERCISES_ON_START=false

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["gunicorn", "fittodoey_backend.wsgi:application", "--bind", "0.0.0.0:8000"]
