# fitTODOay

Docker-first команды для разработки и проверки.

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
