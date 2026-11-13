# Package 35 continuation handoff

Branch `fe-des`; no merge, push or browser execution. The continuation prompt prohibits starting the browser; browser checks below remain pending. No new backend needs: existing N-24 covers REMS context and the illustrative O₂ function.

## Automated evidence

- Red tests before fixes: light theme 5; coach marks 4; persistence 11; unavailable placeholders 2; final review regressions 2. Total: 24 red cases.
- Mutations killed: no-op theme activation (parameter test); no-op persistence save (3 failures); no-op restore (14 failures); uncaught storage write error (1 failure).
- Targeted `npm --workspace @marswalk/web test -- desirables`: 31 passed.
- Full `npm --workspace @marswalk/web test`: 89 files passed, one skipped; 1,717 tests passed, four existing todo cases. One intervening full run failed the unrelated real-timer ReplayRoute ENDED test (`replay-play` absent); its isolated rerun passed all 11 tests and the final full rerun passed. No replay code or test was changed.
- Static checks: `make -s typecheck lint docs-check` passed after final bookkeeping (0 markdown issues, 0 broken links). `graphify update .` completed; its generated report is outside the lane and was restored, with generated outputs excluded from commits.
- Required code review found and fixed three P2 issues: display font below 20 px, hidden responsive coach anchor, light palette leaking to other OPS routes. Review fixes have two new behavioural regressions that ran red before implementation.

## Status rows

| Row | Final state | Reason |
| --- | --- | --- |
| T13.07 | wip | Keyboard and memory-only dismissal unit checks pass; browser toggles/axe/targets/provenance await orchestrator |
| T13.08 | wip | Explicit light planner theme and PRINT contrast unit checks pass; browser contrast/axe await orchestrator |
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

| Check | Configured projects | Result in this continuation |
| --- | --- | --- |
| toggles | desktop-1440 | Not run; browser prohibited |
| contrast, including light planner | desktop-1440 | Not run; browser prohibited |
| axe, including every light coach step | desktop-1440, desktop-1280, desktop-1024, phone-landscape-844x390, phone-portrait-390x844, phone-360x740, tablet-landscape-1024x768, tablet-portrait-768x1024, hud-844x390 | Not run on every listed project; browser prohibited |
| targets | desktop-1440, phone-landscape-844x390, tablet-landscape-1024x768 | Not run on every listed project; browser prohibited |
| provenance | desktop-1440 | Not run; browser prohibited; two N-24 acceptance cases remain fixme |

The package also touches the PRINT assumptions block; the orchestrator should rerun `E2E_PORT=8113 timeout 600s make e2e-one CHECK=print` to confirm page fit. No harness was weakened and no server or browser was left running by this continuation.
