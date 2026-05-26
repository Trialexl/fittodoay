SHELL := /bin/zsh

ROOT := /Users/alexseyalfimov/git/FitTodoay

.PHONY: build-backend build-frontend test-docker up down logs

# Команда на пересборку backend контейнера
build-backend:
	cd $(ROOT) && docker compose build backend

# Команда на пересборку frontend контейнера
build-frontend:
	cd $(ROOT) && docker compose build frontend

# Запуск тестов в docker-окружении (backend pytest + frontend lint)
test-docker:
	cd $(ROOT) && docker compose up -d db redis
	cd $(ROOT) && docker compose run --rm backend pytest -q
	cd $(ROOT)/frontend && npm run lint

# Запуск всех сервисов
up:
	cd $(ROOT) && docker compose up --build backend technique-worker frontend db redis

down:
	cd $(ROOT) && docker compose down

logs:
	cd $(ROOT) && docker compose logs -f --tail=200 backend technique-worker frontend db redis
