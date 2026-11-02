# Marswalk Planner — common tasks. See CLAUDE.md §4.
VENV := .venv
PY := $(VENV)/bin/python

.PHONY: setup lint typecheck test docs-check dev demo data

setup:
	npm ci
	python3 -m venv $(VENV)
	$(PY) -m pip install -q -e 'pipeline[dev]'

lint:
	npm run -s lint:md

typecheck:
	npm run -s typecheck

test:
	npm run -s test:web
	$(PY) -m pytest -q pipeline

docs-check: lint
	python3 scripts/check_links.py docs README.md CLAUDE.md AGENTS.md

dev:
	npm --workspace web run dev

# Production build served from local files only (02 §F: python http.server suffices offline).
demo:
	npm run -s build
	python3 -m http.server --bind 127.0.0.1 --directory web/dist 8080

data:
	@echo "not implemented — see TASK-03"
