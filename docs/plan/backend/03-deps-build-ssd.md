# 03 — Dependency batch, build wiring and the SSD layout

| | |
| --- | --- |
| **Subtasks** | T14.01, T14.11 |
| **Depends on** | 02 merged (no code dependency on 01) |
| **Branch** | `be/03-deps-build-ssd` |
| **Spec refs** | 02 §B, §F (NFR-01, NFR-07, NFR-09); CLAUDE.md §2, §4; decisions BD-12, BD-79 |

## Files

| File | Change |
| --- | --- |
| `apps/hab-core/package.json`, `package-lock.json` | declare `ajv`, `ajv-formats` (already hoisted; pin the installed versions) and add `qrcode` + `@types/qrcode` (one `npm install` in the hab-core workspace) |
| `package.json` (root) | scripts: `hab:record` (`npm --workspace @marswalk/hab-core run replay -- --record`), `e2e` (`playwright test -c e2e/playwright.config.ts`), `check:todos` (`python3 scripts/check_todos.py`) |
| `Makefile` | targets `ssd-link` (`scripts/ssd-link.sh "$(SSD)"`), `record` (`npm run -s hab:record -- scenarios/storm-sol4190 --commands scenarios/storm-sol4190/reference_commands.json scenarios/storm-sol4190/recording.json`), `e2e` (`npm run -s e2e`), `check-todos`; `replay` accepts `COMMANDS=<file>` and passes `--commands`; `.PHONY` updated; other targets unchanged |
| `scripts/ssd-link.sh` (new) | BD-12 layout; idempotent; refuses when `$1` is empty or not a directory; prints every link it makes; never deletes a link target |
| `scripts/check_todos.py` (new) | exits 1 and lists every `TODO(decision)` / `TODO(verify)` in the scope of [decisions-index.md](decisions-index.md) (same globs); `--allow <file>` for none; used by package 30 and 99 |
| `docs/ops/ssd.md` (new) | how to mount, `export SSD=…`, `make ssd-link SSD=$SSD`, create the env: `CONDA_ENVS_PATH="$SSD/marswalk/conda/envs" conda env create -n marswalk-pipeline -f pipeline/environment.yml` then `conda config --append envs_dirs "$SSD/marswalk/conda/envs"`; `make check-env` |
| `CLAUDE.md` §4 | rows for the new and changed targets only (T14.11) |
| `pipeline/environment.yml`, `pipeline/pyproject.toml` | `jsonschema` required (BD-21); `marstime` pinned at the version the SSD env resolves (BD-55, written after `conda env create`) |

## Steps

1. Tests first: add `pipeline/tests/test_ssd_link.py` (pytest, no geo stack) that runs `scripts/ssd-link.sh` against a temp `$SSD` and a temp copy of the repo skeleton (`pipeline/work/.gitkeep`, `data/sites/gale_boxwork/README.md`) and asserts: tracked files still present, each listed child is a symlink to the SSD, a second run changes nothing, an existing `pipeline/work` symlink is replaced by a directory without touching its target.
2. Add `scripts/check_todos.py` with a unit test `scripts/tests/test_check_todos.py` (pytest on a temp tree: counts markers, honours the globs).
3. Install the three packages in one command; record each licence (ajv MIT, ajv-formats MIT, qrcode MIT) and gzipped size in the commit body.
4. Makefile and root scripts; `make -n record replay COMMANDS=x e2e ssd-link SSD=/tmp` prints the expected commands.
5. Write `docs/ops/ssd.md`; update CLAUDE.md §4.

## Automated verification

- `$(make -s pipeline-python) -m pytest -q pipeline/tests/test_ssd_link.py scripts/tests/test_check_todos.py` (or `python3 -m pytest` — neither test needs GDAL).
- `make lint typecheck test-web docs-check`; `npm --workspace @marswalk/hab-core ls ajv ajv-formats qrcode`.
- `make -n data` shows `-m marswalk_pipeline`; `git diff -- CLAUDE.md` touches only §4 rows.

## Status rows

```text
| T14.01 | done | <commit date> | One dependency batch (ajv, ajv-formats, qrcode in hab-core; web choices recorded as BD-79); Makefile targets ssd-link, record, e2e, check-todos; [ssd.md](../ops/ssd.md) |
| T14.11 | done | <commit date> | CLAUDE.md §4 rows match the Makefile (`make -n` output in the commit body) |
```

## Done when

The checks pass and `make ssd-link SSD=<tmp>` is idempotent.
