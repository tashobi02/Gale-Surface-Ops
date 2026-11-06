# Marswalk Surface Ops — common tasks. See CLAUDE.md §4.
# The pipeline runs only in the conda environment below. Its interpreter is looked up by name
# when a target needs it (never at parse time), so lint, typecheck, test-web and docs-check
# work without conda. An active .venv or the PATH order does not change which interpreter is used.
CONDA_ENV ?= marswalk-pipeline
# `conda` may be only a shell function in your interactive shell; Make's sh needs an executable.
CONDA_BIN ?= $(if $(CONDA_EXE),$(CONDA_EXE),conda)

.PHONY: setup setup-web setup-pipeline lint typecheck test test-web docs-check dev demo data \
	conda-check check-env pipeline-python validate progress hab replay agent-skills design-check

setup: setup-web setup-pipeline agent-skills

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
	python3 scripts/update_progress.py --check

# Regenerate the README progress bar from docs/tasks/status.md.
progress:
	python3 scripts/update_progress.py

# Vite dev server for all role views; proxies /sites, /api and /ws to a running Hab Core (`make hab`).
dev:
	npm run -s dev

# Hab Core on 0.0.0.0:8080 (02 §A.5): serves apps/web/dist, data/sites and /ws on the habitat LAN.
hab:
	npm run -s hab:start -- --site gale_boxwork --scenario storm-sol4190

# Headless scenario replay; prints the event-log hash (NFR-06, NFR-14).
replay:
	npm run -s hab:replay -- scenarios/storm-sol4190

# Production build served by the Hab Core on the habitat LAN, no internet (02 §F deployment, NFR-01).
demo:
	npm run -s build
	npm run -s hab:start -- --site gale_boxwork --scenario storm-sol4190

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
	"$$(dirname "$$py")/validate-manifest" data/sites/$(SITE)

# Mirror project skills from .claude/skills/ (the source) into .agents/skills/ (Codex) and .gemini/skills/ (Gemini).
# Impeccable has its own per-tool builds there and is left alone. Copies are git-ignored (docs/ops/agentic-workflow.md).
agent-skills:
	@for d in .claude/skills/*/; do n=$$(basename "$$d"); [ "$$n" = impeccable ] && continue; \
	  for t in .agents/skills .gemini/skills; do mkdir -p "$$t"; rm -rf "$$t/$$n"; cp -R "$$d" "$$t/$$n"; done; done
	@echo "skills mirrored into .agents/skills and .gemini/skills"

# Impeccable's deterministic design detector over the web app (needs internet once to fetch the engine).
design-check:
	npx -y impeccable@4.8.0 detect apps/web/src
