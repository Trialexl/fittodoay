# fitTODOay — Гайд по деплою и мониторингу

## 1. Зависимости
- Docker / Docker Compose
- DNS-запись `A`/`AAAA` для домена, указывающая на VPS
- Открытые порты `80` и `443` (для TLS от Let's Encrypt)
- `backend/.env` (см. `backend/.env.example`) с `DJANGO_*`, OpenRouter и БД
- корневой `.env` (см. `.env.example`) с настройками HTTPS/proxy

## 2. Production: Docker + HTTPS (Caddy)

Важно: production-режим из этого раздела требует домен и действующий TLS-сертификат (выпускается автоматически через Let's Encrypt).

### 2.1 Подготовка переменных
Создайте корневой `.env`:

```bash
cp .env.example .env
```

Минимально заполните:
- `DOMAIN` (например, `app.example.com`)
- `PUBLIC_APP_URL` (например, `https://app.example.com`)
- `LETSENCRYPT_EMAIL`
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (стабильный ключ, не менять между рестартами)
- `DJANGO_ALLOWED_HOSTS`
- `DJANGO_CORS_ALLOWED_ORIGINS`

Создайте `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

И заполните продовые секреты/ключи (`DJANGO_SECRET_KEY`, `OPENROUTER_API_KEY`, БД и т.д.).

### 2.2 Запуск
Запуск прод-контура с HTTPS:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Проверка:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=100 caddy backend frontend
```

В этой схеме:
- внешний трафик идёт только в `caddy` (`80/443`)
- `backend` и `frontend` слушают только `127.0.0.1` на хосте
- Caddy сам выпускает и обновляет TLS-сертификаты
- `frontend` собирается с `NEXT_PUBLIC_API_URL=${PUBLIC_APP_URL}` (через build arg)

### 2.3 Firewall (рекомендуется)
Оставить снаружи только SSH + HTTP/HTTPS:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 3000/tcp
sudo ufw deny 8000/tcp
sudo ufw enable
sudo ufw status verbose
```

## 3. Локальная разработка

Локально можно запускать базовый compose без production override:

```bash
docker compose up -d backend frontend db redis
```

## 4. Мониторинг и устойчивость
- В `docker-compose.prod.yml` включена ротация логов Docker (`20m x 5`) для всех сервисов.
- Проверяйте логи:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --since=30m backend frontend caddy
```

- Проверяйте место на диске:

```bash
df -h
sudo du -xh --max-depth=1 /var/lib/docker | sort -h
docker system df
```

## 5. Чистка места (при необходимости)

```bash
docker system prune
docker volume prune
sudo journalctl --disk-usage
sudo journalctl --vacuum-time=7d
sudo find / -type f -size +500M -exec ls -lh {} \; 2>/dev/null
sudo rm -rf /tmp/*
```
