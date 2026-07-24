# fitTODOay

Docker-first команды для разработки и проверки.

Production-деплой: локально собрать и запушить images, на сервере только `pull` + `up --no-build`.

Настройка OAuth MCP и подключение Codex Desktop: [docs/mcp.md](docs/mcp.md).

```bash
./build-and-push-images.sh
./update-server.sh
```

## Пересборка backend контейнера

```bash
cd /Users/alexseyalfimov/git/FitTodoay
make build-backend
```

## Пересборка frontend контейнера

```bash
cd /Users/alexseyalfimov/git/FitTodoay
make build-frontend
```

## Тесты в Docker

```bash
cd /Users/alexseyalfimov/git/FitTodoay
make build-backend
make test-docker
```

Запускает:
- backend: `pytest -q` (в контейнере `backend`)
- frontend: `npm run lint` (в контейнере `frontend`)

## Запуск всех сервисов

```bash
cd /Users/alexseyalfimov/git/FitTodoay
make up
```

После старта:
- frontend: http://localhost:3000
- backend: http://localhost:8000

Полезное:
- остановка: `make down`
- логи: `make logs`
