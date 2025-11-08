# syntax=docker/dockerfile:1
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VIRTUALENVS_CREATE=false

WORKDIR /app

RUN apt-get update && apt-get install -y build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements-dev.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY backend /app

ENV DJANGO_SETTINGS_MODULE=fittodoey_backend.settings \
    PORT=8000

EXPOSE 8000

CMD ["gunicorn", "fittodoey_backend.wsgi:application", "--bind", "0.0.0.0:8000"]
