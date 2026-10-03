<div align="center">

# fitTODOay

### Your training plan, workout execution, progress, and AI coach — in one place.

**Plan smarter. Train without friction. Learn from every session.**

[English](README.md) · [Русский](README.ru.md)

[Get started](#getting-started) · [Production deployment](docs/deploy.md) · [OAuth MCP](docs/mcp.md) · [API reference](docs/backendapi.md)

</div>

---

fitTODOay is a full-cycle strength-training platform built for people who want more than a static workout list. It connects programming, live workout execution, offline-safe tracking, analytics, AI guidance, technique review, and training music in one focused experience.

Instead of making you jump between notes, timers, spreadsheets, videos, and chatbots, fitTODOay keeps the entire feedback loop together:

> **Create a plan → train today → capture the result → understand the trend → improve the next session.**

## Why fitTODOay stands out

| Capability                                 | What it gives the athlete                                                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI workout planning**                    | A guided wizard creates personalized programs from the real exercise catalog, while the backend validates every generated exercise and training parameter.                              |
| **Flexible program builder**               | Organize programs into folders, schedule days by weekday, interval, cycle, or exact date, and reorder content with drag and drop.                                                       |
| **Workout mode that stays out of the way** | A daily checklist, per-set logging, execution timers, rest timers, completion states, sound, and supported-device vibration keep attention on the workout.                              |
| **Offline-first tracking**                 | Completed sets and body-weight entries are queued locally when the network disappears and synchronized automatically when it returns.                                                   |
| **Progress that becomes actionable**       | Explore workload, exercise performance, body-weight history, and program trends; use AI insights to turn the numbers into concrete next steps.                                          |
| **AI technique review**                    | Upload a short exercise video, let a vision-capable model identify the movement, and receive a structured review with strengths, issues, and next-set cues.                             |
| **Training soundtrack built in**           | Upload MP3 files or use 12 preinstalled live radio streams: 10 high-energy stations for training and 2 calmer stations for recovery.                                                    |
| **OAuth MCP integration**                  | Connect fitTODOay to compatible AI clients such as Codex and let an assistant securely read or update programs, workouts, weigh-ins, and analytics with explicit `read`/`write` scopes. |

## One product, the complete training loop

### 1. Build the plan

Create programs manually or let the AI assistant generate a starting point from your goal, experience, available equipment, weekly frequency, and session duration. The model works only with exercises that exist in the fitTODOay catalog.

### 2. Train today

The app turns active schedules into a focused daily checklist. Log each set, run timed exercises, recover with the rest timer, and keep your current values visible throughout the session.

### 3. Keep going when the connection does not

Workout logs and weigh-ins remain usable offline. Pending entries are clearly marked and synchronized in the background after connectivity returns.

### 4. Review what actually changed

Analytics cover daily workload, exercise progression, program trends, and body weight. AI summaries highlight meaningful changes and propose specific adjustments instead of generic motivation.

### 5. Bring your training data to your assistant

The OAuth-protected MCP server exposes purpose-built tools rather than raw database access. A connected assistant can find exercises, manage programs, inspect the daily plan, log work, record weight, and analyze progress on behalf of the authenticated user.

## Feature highlights

- **870+ bilingual exercises** with muscles, instructions, parameters, and reference images.
- System and custom exercises with weight-based and time-based configurations.
- Multiple programs, reusable day templates, activation controls, comments, and advanced recurrence rules.
- Set-by-set workout logging with planned versus actual values.
- Persistent execution and rest timers designed for mobile workout use.
- Offline queues with deduplication and automatic replay.
- Body-weight tracking kept separate from exercise weights.
- Interactive analytics for days, exercises, programs, and body weight.
- AI conversations around programs and analytics, including reviewable proposed changes.
- Short-video technique analysis with asynchronous processing, limits, retention, and exercise confirmation.
- Global music player with uploads, queue, shuffle, grouping, search, and live radio.
- Secure OAuth MCP with hashed tokens, refresh rotation, consent, revocation, and scoped tools.
- Light/dark appearance controls and a responsive Next.js interface.

## Architecture

```text
Next.js web app
    │
    ├── REST API ───────────────┐
    └── OAuth consent UI        │
                                ▼
                       Django + DRF backend
                         │      │       │
                         │      │       └── OpenRouter (planning, insights, vision)
                         │      └────────── PostgreSQL + pgvector
                         └───────────────── Redis + technique worker

Codex / compatible AI client
    └── OAuth 2.0 + MCP ───────► scoped fitTODOay tools
```

Production uses Docker Compose and Caddy. Caddy terminates HTTPS and routes the web app, REST API, OAuth endpoints, and MCP transport through one public domain.

## Technology

- **Frontend:** Next.js, React, TypeScript, Tailwind CSS, SWR, Zustand, Recharts, dnd-kit
- **Backend:** Django, Django REST Framework, PostgreSQL, pgvector, Redis
- **AI:** OpenRouter for program generation, analytics insights, and vision-based technique review
- **Integration:** Streamable HTTP MCP with OAuth 2.0 authorization
- **Operations:** Docker Compose, Caddy, Let's Encrypt, background technique worker

## Getting started

The recommended development path is Docker-first.

### Requirements

- Docker Engine or Docker Desktop
- Docker Compose v2
- Git
- An OpenRouter API key only if you want to use AI features

### 1. Configure the environment

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

For local development, replace the example Django secret and admin password in `backend/.env`. Add `OPENROUTER_API_KEY` to enable AI planning, analytics insights, and technique review.

### 2. Start the application

```bash
docker compose up --build backend technique-worker frontend db redis
```

Or use:

```bash
make up
```

### 3. Import the exercise catalog on a new database

```bash
docker compose exec backend python manage.py import_exercise_db
```

### 4. Open fitTODOay

- Web app: [http://localhost:3000](http://localhost:3000)
- Backend and Django admin: [http://localhost:8000](http://localhost:8000)

The backend applies migrations automatically when its container starts. The initial Django administrator is created from the `DJANGO_SUPERUSER_*` values in `backend/.env`.

## Quality checks

```bash
make test-docker
```

This runs the backend test suite in Docker and the required frontend lint check. For frontend changes, also run the production build before release:

```bash
cd frontend
npm run build
```

## Documentation

| Document                                      | Purpose                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **[Production deployment](docs/deploy.md)**   | Complete setup, HTTPS, image publishing, release, verification, backup, rollback, and operations guide. |
| **[Deployment — Русский](docs/deploy.ru.md)** | Russian version of the production runbook.                                                              |
| **[OAuth MCP setup](docs/mcp.md)**            | Connect fitTODOay to Codex or another compatible MCP client.                                            |
| **[Backend API](docs/backendapi.md)**         | REST endpoint reference.                                                                                |
| **[Product requirements](docs/prd.md)**       | Product scope and core user flows.                                                                      |
| **[Test plan](docs/test-plan.md)**            | Main functional and regression scenarios.                                                               |

## Production

Do not use the development Compose command as a production deployment recipe. Production uses prebuilt images, Caddy, automatic TLS, restricted service ports, persistent volumes, and explicit secret configuration.

**Start here: [Production deployment guide →](docs/deploy.md)**

---

fitTODOay is built around a simple idea: training data is valuable only when it helps make the next workout better.
