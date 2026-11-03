---
name: verify
description: Run the project checks (make lint, typecheck, test; docs-check and the manifest validator when relevant) before a commit or after changing compute, pipeline, UI or docs code. Reports failures by file and test name.
---
Run each as a separate command, exactly as written (they match the allow rules in `.claude/settings.json`):
1. `make lint`
2. `make typecheck`
3. `make test`
4. If any Markdown or docs changed: `make docs-check`
5. If pipeline code or site assets changed: `.venv/bin/validate-manifest web/public/sites/<site_id>`
   (console script from `pipeline/pyproject.toml`; same command as `.claude/commands/rehearse-offline.md`).
   Until TASK-03 lands it is a stub and raises `NotImplementedError`: report "not implemented", not a pass.
   Do not read `pipeline/work/` or `web/public/sites/*/tiles/**` (denied in settings).

Phase gate (CLAUDE.md §3): while TASK-00 is open, skipped tests (`it.todo`, `@pytest.mark.skip`) are expected. Report the count; do not unskip them.

Report failures by file and test name. Never weaken, skip or delete a test to make it pass.
This skill does not commit by itself. If the user asked for a commit, make it only after the checks pass. End with a one-line pass/fail per step.
