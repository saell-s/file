.PHONY: help venv install api worker beat consumer test lint fmt seed up down logs psql

PY := .venv/Scripts/python.exe
PIP := .venv/Scripts/pip.exe
PYTEST := $(PY) -m pytest
RUFF := $(PY) -m ruff

help:
	@echo "Backend targets:"
	@echo "  make install   - create venv + install deps (dev)"
	@echo "  make api       - run FastAPI on :4000 with reload"
	@echo "  make worker    - run celery worker"
	@echo "  make beat      - run celery beat scheduler"
	@echo "  make consumer  - run event-bus consumer (redis streams)"
	@echo "  make test      - run pytest"
	@echo "  make lint      - ruff check + format check"
	@echo "  make seed      - seed demo data"
	@echo "  make up        - docker compose up --build"
	@echo "  make down      - docker compose down"

venv:
	py -3.13 -m venv .venv || python3 -m venv .venv

install:
	$(PIP) install -e ".[dev]"

api:
	$(PY) -m uvicorn app.main:app --reload --port 4000

worker:
	$(PY) -m celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2

beat:
	$(PY) -m celery -A app.tasks.celery_app beat --loglevel=info

consumer:
	$(PY) -m app.worker.consumer --bus redis

test:
	$(PYTEST) -q

lint:
	$(RUFF) check app tests scripts
	$(RUFF) format --check app tests scripts || true

fmt:
	$(RUFF) check --fix app tests scripts
	$(RUFF) format app tests scripts

seed:
	$(PY) scripts/seed.py

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f api worker

psql:
	docker compose exec postgres psql -U filebox -d filebox
