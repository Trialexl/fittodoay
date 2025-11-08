# fitTODOey Backend

Backend-сервис написан на **Django 5 + DRF** и предоставляет REST API для мобильного/веб клиентов.

## Быстрый старт

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py import_exercises --truncate   # заполнить системный каталог
python manage.py runserver
```

Админ-панель доступна по адресу `http://localhost:8000/admin/`.

## Тесты и качество

```bash
. .venv/bin/activate
pytest            # unit-тесты (workouts/analytics/programs)
python manage.py check
```

## Конфигурация

Все переменные окружения перечислены в `backend/.env.example`. Поддерживаются два варианта БД:

| Значение `DJANGO_DB_ENGINE`             | Описание                          |
|----------------------------------------|-----------------------------------|
| `django.db.backends.sqlite3` (дефолт) | локальная разработка              |
| `django.db.backends.postgresql`       | прод/стейдж, требуют host/port    |

## Docker

```bash
# backend image
docker build -t fittodoey-backend -f backend/Dockerfile .

# запуск миграций
docker run --rm --env-file backend/.env fittodoey-backend python manage.py migrate
```

## API

Полное описание эндпоинтов см. в `../docs/backendapi.md`. Кратко:

- `POST /api/auth/register/`, `POST /api/auth/login/`, `GET/PATCH /api/profile/`
- `GET /api/exercises/`, `GET/POST /api/exercises/custom/`
- `GET/POST /api/programs/folders/`, `GET/POST /api/programs/templates/`, `GET/POST /api/programs/template-exercises/`
- `GET /api/workouts/plan/`, `POST /api/workouts/logs/`
- `GET /api/analytics/days/`, `/exercises/`, `/ai-feed/`

Каждый эндпоинт возвращает JSON и требует `Authorization: Token <token>` (кроме регистрации/логина).
