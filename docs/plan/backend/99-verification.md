# 99 — Verification: per-package review and the end-to-end check

| | |
| --- | --- |
| **Owner** | Final reviewers (opus at medium effort: `typescript-reviewer`, `python-reviewer`, `code-reviewer`; `security-reviewer` for packages 11, 21, 28) |
| **Date** | 2026-11-12 |
| **Related** | [00-overview.md](00-overview.md) · [decisions.md](decisions.md) |

## 1. Every package

1. Tests were written first (the branch history shows the red commit or the PR body shows the red run).
2. The package's named automated checks pass; `make lint typecheck test-web docs-check` pass; `make test` passes where `pipeline/` changed.
3. Status rows match the package file, `make progress` output is committed, `docs/AI_USE.md` has the row.
4. No new `TODO(decision)` / `TODO(verify)`; markers the package touched cite their BD id.
5. Non-negotiables: `grep -rn "Date.now\|new Date()" apps/hab-core/src/engine` empty; no `ol/sphere` or EPSG:3857 path; no inline science outside `packages/compute` and `pipeline/`; every new displayed value has a provenance class in the SNAPSHOT map or the record; no literal number without a source (reviewer reads every new numeric literal).
6. Field names match [01-contract.md](01-contract.md) and 05; nothing beyond the contract was added to `packages/protocol`.

## 2. Package-specific focus

| Package | Reviewer checks in addition |
| --- | --- |
| 01 | Role matrix equals 02 §E.4 row by row; §7b answers each N-item; F7 values typed or spec-sourced |
| 02 | Only listed spec lines changed; every inserted sentence attributed with its BD id |
| 04, 07 | Reference `log_hash` unchanged with the storm pressed at `series_start_utc` |
| 05, 15 | No-data impassable; ingress from the ParamSet; second meeting driven |
| 06, 09 | Next-stop equivalence is exact; HUD fields computed only by the engine/compute |
| 11 | Export of a live session replays to the same hash; recording is deterministic; CLI flags documented |
| 12–14 | 0 skipped compute tests; cancellation shown in flight |
| 17–19 | LINK_STATE only to the suit; no invented link strength; queue values from compute |
| 21 | QR generated locally; `--public-host` validated; no outbound request |
| 22–23 | No binary committed; every source field filled from a fetched page with date; bundle ≤ 250 MB; served offline through the SSD links |
| 25–26 | `scenario.json` byte-identical on rebuild; every 01 §E.1 number cited |
| 27–28 | 0 skipped real-scenario tests; verification-log sections present |
| 29 | Each closure has a trigger test that would fail |
| 30 | `python3 scripts/check_todos.py` exit 0 |

## 3. End-to-end check (go / no-go, BD-07)

Run on `merging-core` after package 30, with the SSD mounted (`export SSD=…; make ssd-link SSD=$SSD`):

1. `make check-env && make validate SITE=gale_boxwork` — env and bundle.
2. `make test` — all Vitest and pytest, 0 failed.
3. **Headless live storm session** — `npm --workspace @marswalk/hab-core test -- liveSession killerDemo` on the real scenario: load `storm-sol4190`, select the hab site, publish the plan with tasks, start the EVA, run the clock (`SET_CLOCK` 60× and `JUMP_NEXT_STOP`), press Start storm at `series_start_utc`, the `RADIATION_ALERT` fires before the Earth forecast is delivered, options are proposed, summon and approve, `CREW_SHELTERED` for both crew, `EVA_ENDED`; `GET /api/report` returns a `PostEvaReport` whose counts equal the log; reset and a second session.
4. **Replay hash stable** — `make replay COMMANDS=scenarios/storm-sol4190/reference_commands.json` twice → identical `log_hash`, equal to the hash recorded by package 27; `make record` twice → identical `recording.json`.
5. **Served app** — `make e2e` (package 28 specs, offline) green; `bash scripts/demo-preflight.sh` green.
6. **Markers** — `python3 scripts/check_todos.py` exit 0; `make docs-check` green.
7. Append "## Freeze check — <date>" to `docs/ops/verification-log.md` with each step's result and the hashes; the orchestrator writes GO only if all seven pass.
