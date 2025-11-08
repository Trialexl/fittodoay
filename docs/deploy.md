# fitTODOey — Гайд по деплою и мониторингу

## 1. Зависимости
- Docker/Docker Compose
- PostgreSQL 15, Redis 7 (используются в `docker-compose.yml`)
- Переменные окружения (см. `backend/.env.example` + `NEXT_PUBLIC_API_URL` для фронта)

## 2. Бэкенд
1. Собрать образ:
   ```bash
   docker build -t fittodoey-backend -f backend/Dockerfile .
   docker build -t fittodoey-frontend -f frontend/Dockerfile .
   ```
2. Применить миграции и создать суперпользователя:
   ```bash
   docker compose run --rm backend python manage.py migrate
   docker compose run --rm backend python manage.py createsuperuser
   ```
3. Запустить сервисы:
   ```bash
   docker compose up -d backend db redis
   ```

## 3. Фронтенд
1. Указать `NEXT_PUBLIC_API_URL` на backend endpoint.
2. Собрать и запустить:
   ```bash
   cd frontend
   npm install
   npm run build
   npm run start
   ```
   Для продакшена можно использовать `next start` за reverse-proxy (Nginx).

## 4. Мониторинг и офлайн-синхронизация
- Включить health-checkи для backend контейнера (endpoints `/admin/`, `/api/analytics/days/`).
- Логи Redis мониторить на предмет очередей таймера (в будущем).
- Таймер отдыха и чеклист работают офлайн: при восстановлении сети фронт повторно вызывает `/api/workouts/plan/` и `/api/workouts/logs/`. Рекомендуется подключить APM (Sentry/Datadog) для отслеживания времени отклика этих эндпоинтов.

## 5. CI/CD
- GitHub Actions (`.github/workflows/ci.yml`) прогоняет линтеры и pytest.
- Для деплоя можно добавить отдельный job, который пушит образы в регистр и дергает сервер (SSH/Webhook).
