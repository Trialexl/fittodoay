#!/bin/sh
set -e

# For Postgres wait until connection succeeds
if [ "$DJANGO_DB_ENGINE" != "django.db.backends.sqlite3" ]; then
  echo "Waiting for database to be ready..."
  until python - <<'PY'
import os
import socket
import sys

host = os.getenv("DJANGO_DB_HOST", "db")
port = int(os.getenv("DJANGO_DB_PORT", "5432"))

try:
    with socket.create_connection((host, port), timeout=2):
        pass
except OSError as exc:
    print(f"Database socket unavailable: {exc}", file=sys.stderr)
    sys.exit(1)
PY
  do
    echo "Database socket unavailable, retrying in 2s..."
    sleep 2
  done

  until python manage.py check --database default >/dev/null 2>&1; do
    echo "Database check failed, retrying in 2s..."
    sleep 2
  done
fi

python manage.py migrate --noinput
python manage.py collectstatic --noinput

if [ -n "$DJANGO_SUPERUSER_EMAIL" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  python manage.py shell <<END
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(email="$DJANGO_SUPERUSER_EMAIL").exists():
    User.objects.create_superuser(
        email="$DJANGO_SUPERUSER_EMAIL",
        password="$DJANGO_SUPERUSER_PASSWORD",
        first_name="$DJANGO_SUPERUSER_FIRST_NAME",
        last_name="$DJANGO_SUPERUSER_LAST_NAME",
    )
END
fi

if [ "$(echo "$IMPORT_EXERCISES_ON_START" | tr '[:upper:]' '[:lower:]')" = "true" ]; then
  python manage.py import_exercise_db --truncate
fi

exec "$@"
