# Package 03 — Visual system: tokens, base styles, status icons, shared patterns

| | |
| --- | --- |
| **Subtasks** | T13.01, T13.03, T13.04, T13.05 |
| **Depends on packages** | 01, 02 |
| **Needs from backend** | — (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-013, FD-020, FD-066–FD-069, FD-073, FD-094, FD-150, FD-153–FD-155, FD-175, FD-208, FD-215 ([decisions](decisions.md)) |
| **Spec and mockup** | 04 §A.3, §C.1–§C.4, §D.1, §F; mockup Token table and Measured contrast; prototype `src/css/tokens.css`, `components.css` |

## Files

- `apps/web/src/ui/styles/tokens.css`
- `apps/web/src/ui/styles/base.css`
- `apps/web/src/ui/styles/patterns.css`
- `apps/web/src/ui/components/statusIcon.ts`
- `apps/web/src/ui/components/patterns.ts (new)`
- `apps/web/tests/ui/baseStyles.test.ts`
- `apps/web/tests/ui/patterns.test.ts`
- `apps/web/tests/ui/statusIcon.test.ts`
- `apps/web/tests/ui/sharedPatterns.test.ts (new)`
- `docs/ops/verification-log.md (append)`
- `docs/tasks/TASK-13_visual-system-accessibility.md (Spec questions: Decided lines)`
- `docs/tasks/status.md, README.md`

## Steps

1. Replace each TODO in tokens.css with the 04 citation or FD row (FD-013, FD-066–FD-069, FD-175); add PRINT advisory/unknown from DV-07.
2. base.css: switch headings to Chakra Petch 500 uppercase per 04 §C.2 (FD-073); `pointer: coarse` 44 px / fine 32 px targets, EVA routes 56 px (FD-153).
3. patterns.ts: one geometry source for the 04 §C.1 hatch, cross-hatch, dots: exports SVG `<pattern>` defs and `CanvasPattern` factories (FD-150); patterns.css uses the same spacing tokens.
4. statusIcon.ts: octagon for warning (FD-208), default size from tokens (FD-215).
5. HUD pill alpha: extend patterns.test.ts with a search over alpha that keeps ≥ 7:1 on every HUD status; write the found value into tokens.css with the test named as its source; remove the `it.fails` (FD-155).
6. T13.03: append a verification-log entry naming the prototype frames `#scr-02-idle` and `#scr-08-ok` as the wireframes (FD-154).

## Named tests (write first)

- `sharedPatterns.test.ts`: `svg and canvas patterns share one spacing`, `warning icon is an octagon`
- `patterns.test.ts`: `every HUD pill keeps 7:1 with its pattern alpha` (no `it.fails` left)
- `baseStyles.test.ts`: updated per FD-094

## Automated check replacing manual acceptance

Enable `grayscale`, `contrast` (tokens), `brand-orange`, `axe` on the existing routes, `viewport360` on BRIEF routes.

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T13.01 wip → done (evidence: tokens.css citations, patterns.test.ts)
- T13.03 add `done` (evidence: prototype frames, verification-log entry, FD-154)
- T13.04 wip → done (evidence: base.css, `offline` font check, `axe`)
- T13.05 wip → done (evidence: statusIcon.ts, patterns.ts, `grayscale` check)

## Done criteria

- No `TODO(decision)`/`TODO(verify)` left in tokens.css, base.css, patterns.css, statusIcon.ts
- Harness checks above green; `make lint typecheck test-web docs-check` green
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
