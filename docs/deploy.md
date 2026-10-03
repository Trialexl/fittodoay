# fitTODOay production deployment

[English](deploy.md) · [Русский](deploy.ru.md) · [Back to README](../README.md)

This runbook contains the production deployment procedure. Development setup stays in the main [README](../README.md#getting-started).

The supported production model is:

1. Build backend and frontend images on a development or CI machine.
2. Push immutable image tags to a Docker-compatible registry.
3. Pull and run those images on the server — never build application images on the VPS.
4. Expose only Caddy on ports `80` and `443`; keep frontend, backend, PostgreSQL, and Redis private.

## 1. Production topology

```text
Internet
   │
   ▼ :80 / :443
Caddy ───────► Next.js frontend :3000
   ├─────────► Django REST API :8000
   └─────────► OAuth + MCP :8000
                    │
                    ├── PostgreSQL + pgvector
                    ├── Redis
                    ├── persistent media volume
                    └── asynchronous technique-review worker
```

Caddy obtains and renews Let's Encrypt certificates automatically. The application, API, OAuth issuer, and MCP resource share one public domain.

## 2. Requirements

### Build machine or CI

- Git
- Docker Engine or Docker Desktop
- Docker Buildx
- Access to a Docker-compatible registry
- Enough memory for the Next.js build; the default Node heap limit is 512 MB

### Production server

- A Linux VPS with Git, Docker Engine, and the Docker Compose v2 plugin
- A public IPv4 and/or IPv6 address
- A DNS `A` and/or `AAAA` record pointing the production domain to the VPS
- Inbound TCP ports `80` and `443`
- SSH access
- Registry credentials able to pull the configured images

Do not expose ports `3000`, `8000`, `5432`, or `6379` publicly.

## 3. Files and secrets

Production requires three local, untracked environment files:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
chmod 600 .env backend/.env frontend/.env
```

Never commit these files. Never reuse the example secrets.

### 3.1 Root `.env`

Set at least:

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

Use `/` for `PUBLIC_APP_URL` in the standard same-origin deployment. Generate the stable Next.js key once and keep it unchanged between releases:

```bash
openssl rand -base64 32
```

Use versioned image tags instead of `latest` when reliable rollback matters.

### 3.2 `backend/.env`

Required production values include:

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

Generate a Django secret, for example:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(64))'
```

The database values must remain aligned with the `db` service in `docker-compose.yml`. PostgreSQL is not published by the production override.

OpenRouter is required only for AI program generation, AI analytics, and technique review. The rest of the product remains available without it.

### 3.3 `frontend/.env`

The file must exist because the base Compose file references it. Use:

```dotenv
NEXT_PUBLIC_API_URL=/
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<same-stable-key-as-root-env>
```

The frontend API URL is compiled into the image by `build-and-push-images.sh`; changing it requires rebuilding the frontend image.

## 4. Pre-release verification

From a clean checkout on the build machine:

```bash
git status --short
make test-docker
cd frontend && npm run build
```

Return to the repository root after the frontend build. Do not publish a release from a dirty or failing worktree.

## 5. Build and publish images

Authenticate to the registry:

```bash
docker login
```

Build and push the image references from the root `.env`:

```bash
./build-and-push-images.sh
```

The script:

- builds for `DOCKER_PLATFORM`;
- creates the backend production image without development dependencies;
- uses the same backend image for the API and technique worker;
- compiles the frontend with `PUBLIC_APP_URL`;
- pushes both configured image tags.

For repeatable releases, update both image tags for every release rather than overwriting an older tag.

## 6. First server installation

Clone the repository on the VPS and enter it:

```bash
git clone https://github.com/Trialexl/fittodoay.git
cd fittodoay
```

Create the three environment files as described in section 3 and fill them with production values. Then authenticate to the registry if the images are private:

```bash
docker login
```

Confirm DNS before starting Caddy:

```bash
dig +short fitness.example.com
```

The result must contain the public address of this server.

## 7. Firewall

Keep SSH access open before enabling the firewall. Example with UFW:

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

Adjust the SSH rule first if the server uses a non-standard SSH port.

## 8. Start or update production

Run on the VPS:

```bash
./update-server.sh
```

The script performs a fast-forward-only Git update, pulls images, starts the production Compose stack with `--no-build`, removes orphan containers, prunes dangling images, and prints service status.

The effective manual commands are:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build --remove-orphans
```

The backend entrypoint automatically applies Django migrations and collects static files before starting the ASGI server.

### Import the exercise catalog on a new database

Run once after the first successful start:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py import_exercise_db
```

The command is idempotent. Do not use `--truncate` on a populated production database unless catalog replacement is intentional and its consequences have been reviewed.

## 9. Verify the release

Check container state:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Inspect startup logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200 caddy backend technique-worker frontend
```

Verify public routing and TLS:

```bash
curl -fsSI https://fitness.example.com/
curl -fsS https://fitness.example.com/.well-known/oauth-authorization-server
curl -fsS https://fitness.example.com/.well-known/oauth-protected-resource/mcp
```

Then manually verify:

1. registration or login;
2. program and workout pages;
3. saving a set and a weigh-in;
4. analytics loading;
5. an AI request if OpenRouter is enabled;
6. technique-review processing if the worker is enabled;
7. OAuth MCP authorization if MCP is part of the release.

OAuth/MCP client setup is documented in [mcp.md](mcp.md).

## 10. Backups

Create a backup directory that is not served by Caddy:

```bash
mkdir -p backups
chmod 700 backups
```

### PostgreSQL

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
  pg_dump -U fittodoey -d fittodoey -Fc > backups/postgres-$(date +%F-%H%M).dump
```

### Uploaded media and technique videos

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm --no-deps \
  --entrypoint tar -v "$PWD/backups:/backup" backend \
  -czf /backup/backend-data-$(date +%F-%H%M).tgz -C /data .
```

### Uploaded music

```bash
tar -czf backups/music-$(date +%F-%H%M).tgz music
```

Copy backups to encrypted storage outside the VPS and test restoration regularly. Database and media backups should be taken together when a consistent recovery point matters.

Restoration overwrites application data. Document and rehearse a separate restore procedure for your environment, and stop application writers before restoring PostgreSQL or media.

## 11. Rollback

Use immutable image tags. To roll back application code:

1. Set `BACKEND_IMAGE` and `FRONTEND_IMAGE` in `.env` to the previous known-good tags.
2. If repository configuration also changed, check out the matching release commit or tag.
3. Pull and recreate the services:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build --remove-orphans
```

4. Repeat the verification checklist.

Django migrations are applied automatically and are not automatically reversed by an image rollback. Review migration compatibility before every release. If a database rollback is required, use a tested backup and an explicit maintenance window.

## 12. Operations

### Logs

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=200 caddy backend technique-worker frontend
```

Docker JSON log rotation is configured through `DOCKER_LOG_MAX_SIZE` and `DOCKER_LOG_MAX_FILE`.

### Capacity

```bash
df -h
docker system df
sudo du -xh --max-depth=1 /var/lib/docker | sort -h
```

### Safe image cleanup

```bash
docker image prune
```

Do not run `docker volume prune` as routine maintenance: named volumes contain PostgreSQL and uploaded media.

### Scheduled cleanup

Run these commands periodically, for example from a host cron job:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend python manage.py cleanup_technique_reviews
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T backend python manage.py cleanup_mcp_oauth
```

## 13. Security checklist

- `DJANGO_DEBUG=false`.
- All example secrets and passwords have been replaced.
- `.env`, `backend/.env`, and `frontend/.env` are readable only by the deployment account.
- Only SSH, HTTP, and HTTPS are publicly reachable.
- Registry credentials are pull-only on the production server when supported.
- PostgreSQL and Redis are not published by the production Compose configuration.
- `DJANGO_ALLOWED_HOSTS`, CORS, and CSRF origins contain only the production domain.
- OpenRouter and OAuth credentials are never embedded in frontend code or committed to Git.
- Docker build context excludes runtime `.env` files; only `.env.example` templates are available to builds.
- Backups are encrypted, stored off-host, and restoration is tested.
- Dependencies and base images are updated on a regular schedule.

## 14. Troubleshooting

### Caddy cannot obtain a certificate

Verify DNS, ports `80`/`443`, the `DOMAIN` value, and Caddy logs. Remove conflicting web servers or reverse proxies from those ports.

### The site returns 502

Check `docker compose ... ps` and inspect backend/frontend logs. Confirm that both application images exist for the server architecture configured by `DOCKER_PLATFORM`.

### Static files or migrations fail

Inspect backend logs and database health. Do not bypass a failed migration by starting an older application image until migration compatibility is understood.

### AI features fail while the rest of the app works

Check the OpenRouter key, selected text and vision models, account limits, and outbound HTTPS connectivity from the backend container.

### MCP authorization fails

Confirm that the issuer and resource metadata use the same HTTPS domain and that the client requests the required `fittoday.read` and `fittoday.write` scopes. See [mcp.md](mcp.md).
