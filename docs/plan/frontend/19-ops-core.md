# Package 19 — SCR-11 ops console wiring: layout, clock, alerts, conditions, sound

| | |
| --- | --- |
| **Subtasks** | T25.01, T25.03, T25.05, T25.07, T25.10 |
| **Depends on packages** | 17 |
| **Needs from backend** | N-06, N-27 (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-012, FD-018, FD-083, FD-085, FD-166, FD-178, FD-206, FD-210 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-11; 04 §E.4, §C.7, §D.2, §F ops keys; prototype `#scr-11-no-session`…`#scr-11-ended`, `src/js/e_ops.js` |

## Files

- `apps/web/src/ui/screens/scr11OpsConsole.tsx`
- `apps/web/src/ui/ops/liveProps.ts`
- `apps/web/src/ui/ops/ClockControl.tsx`
- `apps/web/src/ui/ops/AlertStack.tsx`
- `apps/web/src/ui/ops/ConditionsPanel.tsx`
- `apps/web/src/ui/ops/sound.ts (new)`
- `apps/web/src/state/habSession.ts`
- `apps/web/tests/ui/ops.test.ts`
- `apps/web/tests/ui/opsLive.test.ts`
- `apps/web/tests/state/habSession.test.ts`
- `docs/tasks/TASK-25…, status.md, README.md`

## Steps

1. habSession.ts is the single session owner (FD-178); console reads hooks only; remove superseded hold-timer state.
2. Clock: load scenario, start EVA, 1/10/60×, pause, next event, keys Space/1/2/3/N/K/O; end → report (N-27).
3. Alerts: one slot, +N list (FD-012), advisory dismiss on sim time (FD-083), Hab Core text (FD-206); sound ON with arm (FD-018).
4. Conditions from N-06 (FD-085, FD-166); narrow layouts FD-210.

## Named tests (write first)

- `ops.test.ts`: `keys drive clock`, `advisory dismisses after 10 s sim`, `sound arms on first gesture`, `notice below 1024`
- `habSession.test.ts`: `one session owner`

## Automated check replacing manual acceptance

Enable `targets` (ops), `axe` (ops states), `brand-orange` (ops).

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T25.01, T25.03, T25.05, T25.07, T25.10 wip → done

## Done criteria

- Sol/LTST/phase read real values when N-06 exists
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.
