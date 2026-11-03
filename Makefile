# Marswalk Planner — common tasks. See CLAUDE.md §4.
# The pipeline runs only in the conda environment below. Its interpreter is looked up by name
# when a target needs it (never at parse time), so lint, typecheck, test-web and docs-check
# work without conda. An active .venv or the PATH order does not change which interpreter is used.
CONDA_ENV ?= marswalk-pipeline
# `conda` may be only a shell function in your interactive shell; Make's sh needs an executable.
CONDA_BIN ?= $(if $(CONDA_EXE),$(CONDA_EXE),conda)

.PHONY: setup setup-web setup-pipeline lint typecheck test test-web docs-check dev demo data \
	conda-check check-env pipeline-python validate

setup: setup-web setup-pipeline

setup-web:
	npm ci

# `conda env update` also creates the environment when it is missing.
setup-pipeline: conda-check
	"$(CONDA_BIN)" env update -n $(CONDA_ENV) -f pipeline/environment.yml --prune
	$(MAKE) -s --no-print-directory check-env

lint:
	npm run -s lint:md

typecheck:
	npm run -s typecheck

# Full test run: needs the conda environment (check-env fails first if it is wrong).
test: check-env test-web
	py=$$($(MAKE) -s --no-print-directory pipeline-python) || exit 1; \
	"$$py" -m pytest -q pipeline

# Web tests only; needs no conda.
test-web:
	npm run -s test:web

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

conda-check:
	@command -v "$(CONDA_BIN)" >/dev/null 2>&1 || { \
	  echo "conda not found (looked for '$(CONDA_BIN)'). Put conda on PATH, export CONDA_EXE=/path/to/conda, or run make CONDA_BIN=/path/to/conda ..." >&2; \
	  exit 1; }

# Print the absolute path of the pipeline interpreter. Looked up by environment name in conda's
# own list, so neither PATH order nor an active .venv can change the answer.
pipeline-python: conda-check
	@prefix=$$("$(CONDA_BIN)" env list | awk -v n="$(CONDA_ENV)" '$$1 == n { print $$NF }'); \
	if [ -z "$$prefix" ] || [ ! -x "$$prefix/bin/python" ]; then \
	  echo "conda environment '$(CONDA_ENV)' not found: run 'make setup'" >&2; exit 1; \
	fi; \
	echo "$$prefix/bin/python"

# Fails if the interpreter is not the pipeline environment's, or rasterio, GDAL or pyproj are
# missing or too old (scripts/check_pipeline_env.py).
check-env:
	@py=$$($(MAKE) -s --no-print-directory pipeline-python) || exit 1; \
	"$$py" scripts/check_pipeline_env.py $(CONDA_ENV)

# Usage: make validate SITE=<site_id>. Runs the manifest validator from the pipeline environment.
validate: check-env
	@case "$(SITE)" in ""|*[!a-z0-9_]*) echo "usage: make validate SITE=<site_id> (a-z, 0-9, _)" >&2; exit 2;; esac; \
	py=$$($(MAKE) -s --no-print-directory pipeline-python) || exit 1; \
	"$$(dirname "$$py")/validate-manifest" web/public/sites/$(SITE)
