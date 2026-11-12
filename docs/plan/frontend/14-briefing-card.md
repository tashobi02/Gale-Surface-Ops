# Package 14 — SCR-08 briefing card, map snapshot, stop tasks

| | |
| --- | --- |
| **Subtasks** | T11.03, T11.04, T11.08 |
| **Depends on packages** | 11, 13 |
| **Needs from backend** | — (see [needs](01-needs-from-backend.md)) |
| **Decisions** | FD-133, FD-135, FD-138, FD-139, FD-204 ([decisions](decisions.md)) |
| **Spec and mockup** | 03 SCR-08; 04 §E.8, Appendix A §F SCR-08; mockup DV-16/G-45; prototype `#scr-08-ok`, `#scr-08-over-limits`, `#scr-08-partial`, `src/js/h_misc.js` |

## Files

- `apps/web/src/ui/screens/scr08BriefingCard.tsx`
- `apps/web/src/ui/screens/scr08BriefingCard.css (new)`
- `apps/web/src/ui/briefing/mapSnapshot.ts`
- `apps/web/tests/ui/briefingCard.test.ts (new)`
- `apps/web/tests/ui/mapSnapshot.test.ts (new)`
- `docs/tasks/TASK-11…, status.md, README.md`

## Steps

1. Header: site, plan name (FD-133), data version, plan hash, generated time = computed_utc (FD-138); snapshot 235 px, profile 56 px (FD-204); stops table with tasks (T11.08) and notes (FD-138); metrics, warnings, conditions, assumptions, sources, full 01 §F.1 disclaimer (FD-135).
2. Partial banner 'Plan incomplete — not valid for use', totals omitted; Over limits lists limits; no plan → empty banner + Back (FD-139).
3. Actions: Print, Export plan JSON, Publish to Hab Core, Back.
4. mapSnapshot: render the map canvas to PNG data URL at print size.

## Named tests (write first)

- `briefingCard.test.ts`: `partial omits totals`, `over limits lists limits`, `tasks per stop`, `no plan shows empty banner`

## Automated check replacing manual acceptance

Enable `print` for SCR-08 (1 page A4 and Letter, three states).

## Status row change

Row format: `| Txx.yy | done | 2026-11-DD | <evidence links: test file, harness check, FD ids> |`.

- T11.03, T11.04, T11.08 add `done`

## Done criteria

- `print` SCR-08 green
- Every file changed is in the list above (a needed extra file is named in the PR body)

## Process (every package)

1. Read `00-overview.md` §Rules, the owning TASK file sections of the subtasks above, and the cited FD rows.
2. Tests first (named below), red; then implement to green.
3. Run `make lint typecheck test-web docs-check` and `make e2e-one CHECK=<check>` for each check named below; `graphify update .` after code changes.
4. In the TASK file, add "Decided: FD-nnn (12 Nov 2026, Proposed)" under each Spec question this package closes; remove the code markers listed in the FD rows.
5. Update `docs/tasks/status.md` rows exactly as below, run `make progress`, stage `status.md` and `README.md` in the same commit; append a `docs/AI_USE.md` row.
6. Commit with the subtask ids and FR ids in the title, explicit paths (never `git add -A`), ending with the two attribution lines.

## Package 14 implementation handoff (13 Nov 2026)

FD-360–362 record the local snapshot lifecycle, compact PRINT profile and stop-task wiring. The implementation adds these necessary frontend files beyond the original package list:

- `apps/web/src/ui/briefing/publishPlan.ts` and `apps/web/tests/ui/publishPlan.test.ts`: the wire-named `stop_tasks` adapter and regression.
- `apps/web/src/ui/results/profileChart.ts` and `apps/web/tests/ui/profileChart.test.ts`: optional 56-unit PRINT layout with readable labels.
- `apps/web/tests/ui/context.test.ts`: replace the snapshot stub assertion with its implemented failure contract.
- `apps/web/e2e/lib/briefing.ts` and the existing `print`, `axe`, `contrast`, `provenance` checks: load computed states through the public mock-site planner flow.

Tests first: 13 red briefing/snapshot cases; 4 further red profile/palette/source-link review regressions. The additional publish-adapter test killed a mutation that dropped `stop_tasks`; the invalid-handle contract also killed its guard mutation. A code/design reviewer checked the diff; typography, slope legend and PRINT vector-palette findings were fixed, including refreshing OpenLayers RegularShape cached stroke render options.

Validation: 1,593 web tests pass (six pre-existing todo cases); lint, typecheck and docs-check pass. The Impeccable scoped source detector reported no findings; browser contrast and visual inspection remain pending.

`timeout 60s make e2e-one CHECK=print` cannot start the Hab Core in this sandbox: `listen EPERM: operation not permitted /tmp/tsx-1000/333.pipe`. The check is enabled; no harness bypass or manual acceptance is used. T11.03/04/08 stay `wip` pending its result. Run outside the sandbox:

```sh
make e2e-one CHECK=print
make e2e-one CHECK=axe
make e2e-one CHECK=contrast
make e2e-one CHECK=provenance
```

`plan-hash` stays with package 28 (FD-300); the import-plan control it expects does not exist. Browser print with the demo task payload also needs package 25's task editor; the card's task grouping and publish payload are covered by unit tests now. `graphify` is unavailable in this checkout. Initial `git fetch` failed on the worktree's read-only `FETCH_HEAD`; the orchestrator-prepared branch was retained. No push or lane publication.

## Package 14 browser-verification handoff (13 Nov 2026)

The four browser checks failed together, within about a second, on every project. One root cause: the CSP (`default-src 'self'`) refuses a `data:` image source, so the briefing map's `<img src="data:image/png;base64,…">` never loaded. The PNG bytes were valid — Chromium decoded them when they were handed to it directly — but the browser blocked the element, so the checks read `naturalWidth 0` and every downstream assertion failed with it. FD-363 replaces the data-URL image with a DOM `<canvas>`, which is not an image source and is therefore not restricted; the CSP is unchanged and no file outside the frontend lane is touched.

Two further defects surfaced once the map rendered:

- The profile's NO ROUTE line printed at 2.07 : 1: it uses the screen token `--unknown`, which the print-mode block of `tokens.css` never remaps. FD-364 remaps it to `--print-unknown` (7.1 : 1) on the card.
- Below 600 px the stops table scrolls sideways, which made `.scr08-stops` a scrollable region; axe `scrollable-region-focusable` requires it to be focusable. FD-365 gives the section `tabIndex={0}`.

FD-366 hardens the print check itself: the stylesheet's `@page { margin: 12mm }` is the margin Chromium applies (it overrides the `page.pdf({ margin })` option), and the check now proves the rule is live — two renders with different PDF margin options must be byte-identical — so the rule cannot go silently dead the way SCR-17's inline `<style>` did. The check also asserts the `/MediaBox` of the A4 and Letter PDFs and that no leaf text element of the card is clipped in print media.

Browser results on port 8108, Chromium, against the mock site (`?site=mock_site`):

| Check | Projects | Result |
| --- | --- | --- |
| `print` | desktop-1440 | 2 passed, 1 skipped (SCR-17 is package 29) |
| `axe` | all 9 projects | 70 passed, 20 skipped |
| `contrast` | desktop-1440 | 8 passed |
| `provenance` | desktop-1440 | 3 passed, 2 skipped (packages 28/29) |
| `offline` | all 9 projects | 27 passed |

Manual review of the three states in the browser: the OK card shows the banner, the totals and the radiation block; Over limits lists the exceeded limit; Partial shows "Plan incomplete — not valid for use" with the totals and the dose omitted and Publish disabled; the map canvas is painted and no `<img>` is in the card; 75 (OK) and 54 (Partial) displayed values carry a provenance label and a source, with no unlabelled number; the disclaimer and every source link are present. The demo plan carries no stop tasks — the planner has no task editor yet (package 25) — so the per-stop task grouping and the publish payload are covered by the unit tests only.

T11.03, T11.04 and T11.08 are `done`: the `print` check that names them is green on every project it runs on.
