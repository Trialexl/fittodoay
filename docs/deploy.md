# fitTODOay — Гайд по деплою и мониторингу

## 1. Зависимости
- Docker / Docker Compose
- PostgreSQL 15 и Redis 7 (используются в корневом `docker-compose.yml`)
- Файл конфигурации `backend/.env` (см. `backend/.env.example`), где настраиваются:
  - `DJANGO_*`, ключ Django
  - OpenRouter (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_BASE_URL`, `OPENROUTER_REFERRER`, `OPENROUTER_APP_NAME`)
- Для фронтенда обязательно указать `NEXT_PUBLIC_API_URL` (URL backend API)

## 2. Бэкенд (Django + DRF)

### Docker-образ
```bash
docker build -t fittodoey-backend -f backend/Dockerfile .
```

### Быстрый запуск (SQLite внутри контейнера)
```bash
docker run --rm -p 8000:8000 --env-file backend/.env fittodoey-backend
```
`entrypoint.sh` применит миграции; API будет доступен по `http://localhost:8000`.

### Docker Compose (Postgres + Redis)
```bash
docker compose up -d backend db redis
```
`docker-compose.yml` пробрасывает порт `8000`, а БД и Redis живут в отдельных контейнерах. Для override‑ов используйте `.env` рядом с файлом Compose (см. переменные внутри файла).

## 3. Фронтенд (Next.js)

### Переменные окружения
Создайте файл `frontend/.env` (или `.env.local` для разработки) и укажите в нём все переменные, влияющие на фронтенд. Они должны начинаться с `NEXT_PUBLIC_`, чтобы попасть в браузер. Сейчас требуется только URL API:
```
NEXT_PUBLIC_API_URL=http://backend:8000
```
Для публичных окружений передавайте HTTPS-URL через `.env` или переменные Compose (`NEXT_PUBLIC_API_URL=https://api.example.com`).

### Docker-образ
```bash
docker build -t fittodoey-frontend -f frontend/Dockerfile .
```
```bash
docker run --rm -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://localhost:8000 \
  fittodoey-frontend
```

### Локальная разработка
```bash
cd frontend
npm install
npm run dev            # дев-сервер
npm run build && npm run start   # прод-сборка
```

### Совместный запуск (backend + frontend + db + redis)
Корневой `docker-compose.yml` включает все сервисы. Достаточно одной команды:
```bash
NEXT_PUBLIC_API_URL=http://backend:8000 docker compose up -d backend frontend db redis
```
По умолчанию фронт внутри сети обращается к `http://backend:8000`. Извне приложение доступно на `http://localhost:3000`.

## 4. Мониторинг и офлайн-синхронизация
- Включить health-checkи для backend контейнера (endpoints `/admin/`, `/api/analytics/days/`).
- Логи Redis мониторить на предмет очередей таймера (в будущем).
- Таймер отдыха и чеклист работают офлайн: при восстановлении сети фронт повторно вызывает `/api/workouts/plan/` и `/api/workouts/logs/`. Рекомендуется подключить APM (Sentry/Datadog) для отслеживания времени отклика этих эндпоинтов.

## 5. CI/CD
- GitHub Actions (`.github/workflows/ci.yml`) прогоняет линтеры и pytest.
- Для деплоя можно добавить отдельный job, который пушит образы в регистр и дергает сервер (SSH/Webhook).


чистка места после частых билдов контейнеров

df -h

sudo du -xh --max-depth=1 / | sort -h

sudo du -xh --max-depth=1 /var | sort -h

sudo du -xh --max-depth=1 /var/lib/docker | sort -h

docker system df

docker system prune

docker volume prune

sudo journalctl --disk-usage

sudo journalctl --vacuum-time=7d

sudo find / -type f -size +500M -exec ls -lh {} \; 2>/dev/null

sudo rm -rf /tmp/*