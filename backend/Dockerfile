# syntax=docker/dockerfile:1
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY backend /app

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
