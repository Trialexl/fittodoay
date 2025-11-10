# fitTODOay Backend

Backend-сервис написан на **Django 5 + DRF** и предоставляет REST API для мобильного/веб клиентов.

## Быстрый старт

```bash
# локально (без Docker)
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver

# или одной командой в Docker (SQLite внутри контейнера):
docker build -t fittodoey-backend -f backend/Dockerfile .
docker run --rm -p 8000:8000 fittodoey-backend
```

Админ-панель доступна по адресу `http://localhost:8000/admin/`.

## Тесты и качество

```bash
. .venv/bin/activate
pytest            # unit-тесты (workouts/analytics/programs)
python manage.py check
```

## Конфигурация

Все переменные окружения перечислены в `backend/.env.example` (скопируйте в `backend/.env` перед запуском). Помимо стандартных `DJANGO_*` там есть блок для LLM‑агента:

| Переменная              | Назначение                                                                 |
|------------------------|----------------------------------------------------------------------------|
| `OPENROUTER_API_KEY`   | Ключ OpenRouter. Хранится только на бэкенде, никогда не уходит на фронт.   |
| `OPENROUTER_MODEL`     | Идентификатор модели (например, `openrouter/anthropic/claude-3.5-sonnet`). |
| `OPENROUTER_BASE_URL`  | Базовый URL API OpenRouter (`https://openrouter.ai/api/v1`).               |

Поддерживаются два варианта БД:

| Значение `DJANGO_DB_ENGINE`             | Описание                          |
|----------------------------------------|-----------------------------------|
| `django.db.backends.sqlite3` (дефолт) | локальная разработка              |
| `django.db.backends.postgresql`       | прод/стейдж, требуют host/port    |

## Docker

```bash
# сборка прод-образа
docker build -t fittodoey-backend -f backend/Dockerfile .

# запуск с Postgres (пример через docker compose)
cd backend
docker compose up -d backend db redis
```

## API

Полное описание эндпоинтов см. в `../docs/backendapi.md`. Кратко:

- `POST /api/auth/register/`, `POST /api/auth/login/`, `GET/PATCH /api/profile/`
- `GET /api/exercises/`, `GET/POST /api/exercises/custom/`
- `GET/POST /api/programs/folders/`, `GET/POST /api/programs/templates/`, `GET/POST /api/programs/template-exercises/` (для каждого пользователя автоматически создаётся папка «Основные»)
- `GET /api/workouts/plan/`, `POST /api/workouts/logs/`
- `GET /api/analytics/days/`, `/exercises/`, `/ai-feed/`

Каждый эндпоинт возвращает JSON и требует `Authorization: Token <token>` (кроме регистрации/логина).
