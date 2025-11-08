#!/bin/sh
set -e

python manage.py migrate --noinput

if [ "$IMPORT_EXERCISES_ON_START" = "true" ]; then
  python manage.py import_exercises --truncate
fi

exec "$@"
