# Package 35 continuation handoff

Branch `fe-des`; no merge, push or browser execution by the package agent itself — the continuation prompt prohibits starting the browser. The orchestrator ran the browser checks afterwards, on `core-frontend` after the package merged; those results are recorded below. No new backend needs: existing N-24 covers REMS context and the illustrative O₂ function.

## Automated evidence

- Red tests before fixes: light theme 5; coach marks 4; persistence 11; unavailable placeholders 2; final review regressions 2. Total: 24 red cases.
- Mutations killed: no-op theme activation (parameter test); no-op persistence save (3 failures); no-op restore (14 failures); uncaught storage write error (1 failure).
- Targeted `npm --workspace @marswalk/web test -- desirables`: 31 passed.
- Full `npm --workspace @marswalk/web test`: 89 files passed, one skipped; 1,717 tests passed, four existing todo cases. One intervening full run failed the unrelated real-timer ReplayRoute ENDED test (`replay-play` absent); its isolated rerun passed all 11 tests and the final full rerun passed. No replay code or test was changed.
- Static checks: `make -s typecheck lint docs-check` passed after final bookkeeping (0 markdown issues, 0 broken links). `graphify update .` completed; its generated report is outside the lane and was restored, with generated outputs excluded from commits.
- Required code review found and fixed three P2 issues: display font below 20 px, hidden responsive coach anchor, light palette leaking to other OPS routes. Review fixes have two new behavioural regressions that ran red before implementation.

## Browser results (orchestrator run on `core-frontend`, after the package merged)

The orchestrator ran the checks the package could not. Port 8161 onward, one check at a time, on the merged `core-frontend` branch.

| Check | Projects | Result |
| --- | --- | --- |
| toggles | desktop-1440 | 3 passed |
| contrast, including light planner | desktop-1440 | 17 passed |
| provenance | desktop-1440 | 17 passed, 2 skipped (both `test.fixme` naming N-24) |
| print | desktop-1440 | 8 passed |
| targets | every project | 125 passed, 35 skipped |
| axe | every project | 193 passed, 49 skipped, 0 failed (after the fix below) |

The first axe run found two failures, and one was a real defect:

- `phone-360x740` "EVA full map, options and cached transport-loss overlay": a **serious** `scrollable-region-focusable` violation on `div[data-slot="link-lost-overlay"]`. The overlay scrolls on a narrow phone and the EVA notice carries no focusable control of its own, so the scrollable region had no keyboard access. Fixed in FD-519: the overlay is now `tabIndex={0}` with `role="region"` and a label, with a regression test whose mutation (reverting the attributes) fails it. The rerun is green.
- `desktop-1280` "EVA tablet states and high contrast": the test timed out at 3.0 m while three Playwright runs shared the machine. It runs 16 axe scans (8 EVA states × base and high contrast) inside a 180 s budget, about 11 s per scan. It passed on every project of the clean rerun (12.1 m, 193 passed, 49 skipped, 0 failed), so it is the known load-dependent timeout family, not an accessibility regression. The check is unchanged.

The `planner-drawer` check added by the package-25 drawer fix also passes on all six registered viewports (desktop-1440, phone-landscape-844x390, phone-portrait-390x844, phone-360x740, tablet-landscape-1024x768, tablet-portrait-768x1024).

## Status rows

| Row | Final state | Reason |
| --- | --- | --- |
| T13.07 | done | Keyboard and memory-only dismissal unit checks pass, and the browser toggles, targets, axe and provenance checks pass on every project |
| T13.08 | done | Explicit light planner theme and PRINT contrast unit checks pass, and the browser contrast (including light planner) and axe (including the light planner and the light coach steps) checks pass |
| T18.03 | wip | N-24 REMS context absent; sourced unavailable dash; harness `test.fixme` names N-24 |
| T18.06 | wip | N-24 O₂ output absent; illustrative sourced unavailable dash; harness `test.fixme` names N-24 |
| T18.07 | done | Fifteen persistence unit/integration checks pass, including restore/recompute through the real store and ignored blocked storage |

## Browser commands for the orchestrator

Run sequentially in the foreground. Each command uses this worktree's assigned port. No `E2E_SKIP_BUILD` is specified, since app source changed. Planner URLs added by this package include `?site=mock_site`; the light checks also include `theme=light`. A missing bundle is a skip, not acceptance.

```sh
E2E_PORT=8113 timeout 600s make e2e-one CHECK=toggles
E2E_PORT=8113 timeout 600s make e2e-one CHECK=contrast
E2E_PORT=8113 timeout 600s make e2e-one CHECK=axe
E2E_PORT=8113 timeout 600s make e2e-one CHECK=targets
E2E_PORT=8113 timeout 600s make e2e-one CHECK=provenance
```

The package agent did not run these (the continuation prompt prohibited starting the browser); the orchestrator did, and the results are in the table above. The `axe` check needs a budget longer than 600 s — it sweeps every project, and the run above took 15.3 minutes.

No harness was weakened and no server or browser was left running by the continuation.
