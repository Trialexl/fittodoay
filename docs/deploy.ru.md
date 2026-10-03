# Production-деплой fitTODOay

[English](deploy.md) · [Русский](deploy.ru.md) · [Вернуться к README](../README.ru.md)

В этом документе находится полный production runbook. Локальный запуск для разработки описан в основном [README](../README.ru.md#с-чего-начать).

Поддерживаемая схема production-деплоя:

1. Backend и frontend images собираются на машине разработчика или в CI.
2. Images с неизменяемыми тегами публикуются в Docker-совместимом registry.
3. Сервер только скачивает и запускает готовые images — приложение не собирается на VPS.
4. Снаружи доступны только порты Caddy `80` и `443`; frontend, backend, PostgreSQL и Redis остаются закрытыми.

## 1. Production-топология

```text
Интернет
   │
   ▼ :80 / :443
Caddy ───────► Next.js frontend :3000
   ├─────────► Django REST API :8000
   └─────────► OAuth + MCP :8000
                    │
                    ├── PostgreSQL + pgvector
                    ├── Redis
                    ├── постоянный volume медиафайлов
                    └── асинхронный worker проверки техники
```

Caddy автоматически получает и обновляет сертификаты Let's Encrypt. Приложение, API, OAuth issuer и MCP resource работают через один публичный домен.

## 2. Требования

### Машина сборки или CI

- Git
- Docker Engine или Docker Desktop
- Docker Buildx
- Доступ к Docker-совместимому registry
- Достаточно памяти для сборки Next.js; лимит heap Node по умолчанию — 512 MB

### Production-сервер

- Linux VPS с Git, Docker Engine и Docker Compose v2
- Публичный IPv4 и/или IPv6 адрес
- DNS-запись `A` и/или `AAAA`, направленная на VPS
- Входящие TCP-порты `80` и `443`
- SSH-доступ
- Registry credentials с правом скачивания настроенных images

Не публикуйте наружу порты `3000`, `8000`, `5432` и `6379`.

## 3. Файлы окружения и секреты

Для production нужны три локальных файла, не отслеживаемых Git:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
chmod 600 .env backend/.env frontend/.env
```

Никогда не коммитьте эти файлы и не используйте примерные секреты в production.

### 3.1 Корневой `.env`

Минимальные значения:

```dotenv
DOMAIN=fitness.example.com
PUBLIC_APP_URL=/
LETSENCRYPT_EMAIL=ops@example.com

BACKEND_IMAGE=docker.io/your-org/fittodoay-backend:2026-10-03
FRONTEND_IMAGE=docker.io/your-org/fittodoay-frontend:2026-10-03
DOCKER_PLATFORM=linux/amd64

NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<stable-random-key>

DJANGO_ALLOWED_HOSTS=fitness.example.com
DJANGO_CORS_ALLOWED_ORIGINS=https://fitness.example.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://fitness.example.com
```

В стандартной same-origin схеме используйте `/` для `PUBLIC_APP_URL`. Один раз сгенерируйте стабильный ключ Next.js и не меняйте его между релизами:

```bash
openssl rand -base64 32
```

Для надёжного rollback используйте версионные теги images вместо `latest`.

### 3.2 `backend/.env`

Основные production-значения:

```dotenv
DJANGO_SECRET_KEY=<long-random-secret>
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=fitness.example.com
DJANGO_CORS_ALLOWED_ORIGINS=https://fitness.example.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://fitness.example.com

DJANGO_DB_ENGINE=django.db.backends.postgresql
DJANGO_DB_NAME=fittodoey
DJANGO_DB_USER=fittodoey
DJANGO_DB_PASSWORD=fittodoey
DJANGO_DB_HOST=db
DJANGO_DB_PORT=5432

DJANGO_SUPERUSER_EMAIL=<private-admin-email>
DJANGO_SUPERUSER_PASSWORD=<strong-unique-password>

OPENROUTER_API_KEY=<openrouter-key>
OPENROUTER_MODEL=<text-model>
OPENROUTER_VISION_MODEL=<vision-capable-model>
OPENROUTER_REFERRER=https://fitness.example.com
OPENROUTER_APP_NAME=fitTODOay

IMPORT_EXERCISES_ON_START=False
DJANGO_TECHNIQUE_ANALYSIS_MODE=async
```

Пример генерации Django secret:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(64))'
```

Параметры БД должны совпадать с сервисом `db` в `docker-compose.yml`. В production override PostgreSQL не публикуется наружу.

OpenRouter требуется только для AI-создания программ, AI-аналитики и проверки техники. Остальные возможности приложения доступны без него.

### 3.3 `frontend/.env`

Файл должен существовать, потому что на него ссылается базовый Compose:

```dotenv
NEXT_PUBLIC_API_URL=/
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<same-stable-key-as-root-env>
```

Frontend API URL встраивается в image скриптом `build-and-push-images.sh`. После его изменения frontend image необходимо пересобрать.

## 4. Проверка перед релизом

В чистом checkout на машине сборки:

```bash
git status --short
make test-docker
cd frontend && npm run build
```

После сборки frontend вернитесь в корень репозитория. Не публикуйте релиз из dirty worktree или при красных проверках.

## 5. Сборка и публикация images

Войдите в registry:

```bash
docker login
```

Соберите и отправьте images, указанные в корневом `.env`:

```bash
./build-and-push-images.sh
```

Скрипт:

- собирает под `DOCKER_PLATFORM`;
- создаёт production backend image без dev-зависимостей;
- использует один backend image для API и technique worker;
- компилирует frontend с `PUBLIC_APP_URL`;
- публикует оба тега.

Для воспроизводимых релизов назначайте новые теги обоим images, а не перезаписывайте старый тег.

## 6. Первая установка на сервер

Клонируйте репозиторий на VPS:

```bash
git clone https://github.com/Trialexl/fittodoay.git
cd fittodoay
```

Создайте три файла окружения по разделу 3 и заполните production-значениями. Если images приватные, авторизуйтесь в registry:

```bash
docker login
```

Перед запуском Caddy проверьте DNS:

```bash
dig +short fitness.example.com
```

Ответ должен содержать публичный адрес текущего сервера.

## 7. Firewall

Перед включением firewall обязательно оставьте доступным SSH. Пример для UFW:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3000/tcp
sudo ufw deny 8000/tcp
sudo ufw deny 5432/tcp
sudo ufw deny 6379/tcp
sudo ufw enable
sudo ufw status verbose
```

Если SSH работает на нестандартном порту, сначала добавьте правило для него.

## 8. Запуск или обновление production

На VPS выполните:

```bash
./update-server.sh
```

Скрипт делает fast-forward-only Git update, скачивает images, запускает production Compose с `--no-build`, удаляет orphan containers, чистит dangling images и показывает статус сервисов.

Ручной эквивалент:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build --remove-orphans
```

Перед запуском ASGI backend entrypoint автоматически применяет миграции Django и собирает static files.

### Импорт каталога в новую базу

После первого успешного запуска выполните один раз:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py import_exercise_db
```

Команда идемпотентна. Не применяйте `--truncate` к заполненной production-базе без явного решения заменить каталог и оценки последствий.

## 9. Проверка релиза

Проверьте контейнеры:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Посмотрите логи запуска:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 caddy backend technique-worker frontend
```

Проверьте публичную маршрутизацию и TLS:

```bash
curl -fsSI https://fitness.example.com/
curl -fsS https://fitness.example.com/.well-known/oauth-authorization-server
curl -fsS https://fitness.example.com/.well-known/oauth-protected-resource/mcp
```

Ручной smoke test:

1. регистрация или вход;
2. страницы программ и тренировки;
3. сохранение подхода и веса тела;
4. загрузка аналитики;
5. AI-запрос, если подключён OpenRouter;
6. обработка проверки техники, если включён worker;
7. OAuth MCP authorization, если MCP входит в релиз.

Настройка OAuth/MCP-клиента описана в [mcp.md](mcp.md).

## 10. Резервные копии

Создайте директорию, которая не раздаётся Caddy:

```bash
mkdir -p backups
chmod 700 backups
```

### PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
  pg_dump -U fittodoey -d fittodoey -Fc > backups/postgres-$(date +%F-%H%M).dump
```

### Загруженные медиа и видео проверки техники

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --no-deps \
  --entrypoint tar -v "$PWD/backups:/backup" backend \
  -czf /backup/backend-data-$(date +%F-%H%M).tgz -C /data .
```

### Загруженная музыка

```bash
tar -czf backups/music-$(date +%F-%H%M).tgz music
```

Копируйте резервные копии в зашифрованное хранилище вне VPS и регулярно проверяйте восстановление. Если важна единая точка восстановления, снимайте копии БД и медиа вместе.

Восстановление перезаписывает данные приложения. Подготовьте и отрепетируйте отдельную процедуру восстановления для своего окружения; перед восстановлением PostgreSQL или медиа остановите процессы записи.

## 11. Rollback

Используйте неизменяемые теги images. Для отката приложения:

1. Укажите предыдущие рабочие теги в `BACKEND_IMAGE` и `FRONTEND_IMAGE` корневого `.env`.
2. Если менялась конфигурация репозитория, переключитесь на соответствующий release commit или tag.
3. Скачайте images и пересоздайте сервисы:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build --remove-orphans
```

4. Повторите smoke test.

Миграции Django применяются автоматически и не откатываются вместе с image. Перед каждым релизом проверяйте совместимость миграций. Если нужен rollback базы, используйте проверенную резервную копию и отдельное окно обслуживания.

## 12. Эксплуатация

### Логи

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=200 caddy backend technique-worker frontend
```

Ротация Docker JSON logs управляется переменными `DOCKER_LOG_MAX_SIZE` и `DOCKER_LOG_MAX_FILE`.

### Дисковое пространство

```bash
df -h
docker system df
sudo du -xh --max-depth=1 /var/lib/docker | sort -h
```

### Безопасная чистка images

```bash
docker image prune
```

Не используйте `docker volume prune` для регулярной чистки: named volumes содержат PostgreSQL и загруженные медиа.

### Регулярная очистка данных приложения

Эти команды можно запускать по расписанию, например через cron хоста:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend python manage.py cleanup_technique_reviews
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend python manage.py cleanup_mcp_oauth
```

## 13. Checklist безопасности

- Установлено `DJANGO_DEBUG=false`.
- Все примерные секреты и пароли заменены.
- `.env`, `backend/.env` и `frontend/.env` доступны только deployment-пользователю.
- Снаружи открыты только SSH, HTTP и HTTPS.
- На production-сервере используются pull-only registry credentials, если registry это поддерживает.
- PostgreSQL и Redis не опубликованы production Compose-конфигурацией.
- `DJANGO_ALLOWED_HOSTS`, CORS и CSRF origins содержат только production-домен.
- Ключи OpenRouter и OAuth credentials не попадают во frontend и Git.
- Docker build context исключает рабочие `.env`; при сборке доступны только шаблоны `.env.example`.
- Резервные копии зашифрованы, хранятся вне сервера, восстановление проверяется.
- Зависимости и базовые images регулярно обновляются.

## 14. Диагностика

### Caddy не получает сертификат

Проверьте DNS, порты `80`/`443`, значение `DOMAIN` и логи Caddy. Уберите другие web-серверы или reverse proxies с этих портов.

### Сайт отвечает 502

Проверьте `docker compose ... ps` и логи backend/frontend. Убедитесь, что оба application images существуют для архитектуры сервера из `DOCKER_PLATFORM`.

### Не применяются миграции или static files

Посмотрите backend logs и состояние БД. Не обходите ошибочную миграцию запуском старого image, пока не проверена совместимость схемы.

### AI-функции не работают, но приложение доступно

Проверьте ключ OpenRouter, выбранные text/vision модели, лимиты аккаунта и исходящее HTTPS-подключение из backend container.

### Ошибка OAuth MCP

Убедитесь, что issuer и resource metadata используют один HTTPS-домен, а клиент запрашивает необходимые scopes `fittoday.read` и `fittoday.write`. Подробности — в [mcp.md](mcp.md).
