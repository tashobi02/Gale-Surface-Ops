# 29 — Fallbacks (last): options, trigger checks and closures

| | |
| --- | --- |
| **Subtasks** | T01.06, T03.23, T03.24, T03.25, T03.26, T03.27, T04.09, T05.30, T05.31, T05b.21, T06.11, T21.13, T21.14, T22.15, T23.09, T26.08, T29.07 (T20.09 is built in package 21) |
| **Depends on** | 24, 27 (the trigger checks read their results) |
| **Branch** | `be/29-fallbacks` (split into 29a pipeline options + closures, 29b compute T05.30 if over 15 files) |
| **Spec refs** | 06 §C, §D.4, §D.5; map §h.7; decision BD-01 |

## A. Built as opt-in options (trigger can still fire)

| Subtask | Option | Test |
| --- | --- | --- |
| T03.23 | pipeline `--max-zoom <level>` drops finer tile levels in one place (the C9 resolution list) | pytest: manifest lists only the kept levels; validator green on the mock site |
| T03.24 | pipeline `--cell-m 10` writes a 10 m routing grid (aggregation as the 5→10 m vehicle rule) | pytest on the mock site; compute `loadGrid` reads `cell_m` (Vitest) |
| T03.25 | pipeline `--static-images` writes `images/<layer_id>.png` per 2 m layer (BD-23) with manifest assets | pytest |
| T05.30 | compute `validateManualLeg(grid, scenario, from, to, vertices)` + worker `VALIDATE_MANUAL_LEG` (01-contract §7) → Leg via `cellsAlongPath` + `toLeg`, warnings | Vitest |

## B. Conditional (run the fallback only if the trigger check fails)

| Subtask | Trigger check (automated) | If it fails |
| --- | --- | --- |
| T05.31 | package 24 p95 ≤ 2 s | build the FastAPI `/route` server of TASK-05 T05.31 on localhost, behind the CSP check of TASK-05 Q16 |
| T05b.21 | package 24 haven GO | 10 m grid for all fields + `T_hab` precomputed in the pipeline |
| T06.11 | package 12 mars24/sun tests green with 0 skipped | precomputed sun table for the demo dates |

## C. Closed — trigger provably false (BD-01)

Each gets a test in `scripts/tests/test_fallback_triggers.py` (pytest, no geo stack) that fails if the trigger becomes true:

| Subtask | Check |
| --- | --- |
| T01.06 | ADR-001 status line reads Accepted for Gale (BD-11) |
| T03.26 | `docs/ops/feasibility/coverage.md` records colour COG coverage of the AOI and the bundle has ortho tiles |
| T03.27 | the bundle's TI grid exists with valid cells (`grid/ti_100m.f32` asset in the manifest) |
| T04.09 | the traverse vector exists, sourced from PLACES (`pds-msl-places-localizations`) |
| T21.13 | `dose_series.json` `method == "archive"` and covers sol 4190 |
| T21.14 | `earth_link.json` `kernels` non-empty and `pipeline/spice/kernels.lock.json` covers the window |
| T22.15 | `consumables.ts` models O₂ only (the fallback's state is already the primary) |
| T23.09 | `summonReal.test.ts` exact-rendezvous cases pass (Vitest run recorded) |
| T26.08 | cut 5 not called (06 §D.4 contingency only; team decision 5 Nov) and `links.test.ts` green |
| T29.07 | cut 2 not called and `rover.test.ts` green |

## Automated verification

`"$PY" -m pytest -q pipeline/tests scripts/tests/test_fallback_triggers.py` · `npm --workspace @marswalk/compute test -- manualLeg` · `make typecheck`.

## Status rows (one per subtask)

```text
| T03.23 | done | <commit date> | --max-zoom option, tested (opt-in, BD-01) |
| T03.24 | done | <commit date> | --cell-m 10 option, tested (opt-in) |
| T03.25 | done | <commit date> | --static-images option, tested (opt-in) |
| T05.30 | done | <commit date> | validateManualLeg + VALIDATE_MANUAL_LEG (opt-in) |
| T05.31 | done | <commit date> | Not triggered: real-grid p95 ≤ 2 s (package 24 log); trigger test in test_fallback_triggers.py |
| T05b.21 | done | <commit date> | Not triggered: haven benchmark GO |
| T06.11 | done | <commit date> | Not triggered: mars24/sun green, 0 skipped |
| T01.06 | done | <commit date> | Not triggered: ADR-001 Accepted (Gale) |
| T03.26 | done | <commit date> | Not triggered: colour COG covers the AOI |
| T03.27 | done | <commit date> | Not triggered: quantitative TI covers the AOI |
| T04.09 | done | <commit date> | Not triggered: PLACES packaging in use |
| T21.13 | done | <commit date> | Not triggered: archive series covers sol 4190 |
| T21.14 | done | <commit date> | Not triggered: kernels obtained |
| T22.15 | done | <commit date> | Not triggered: the consumables model is O₂ only |
| T23.09 | done | <commit date> | Not triggered: exact rendezvous passes |
| T26.08 | done | <commit date> | Not triggered: cut 5 not called |
| T29.07 | done | <commit date> | Not triggered: cut 2 not called |
```

If a B-row trigger fails, its row instead cites the built fallback and its test.

## Done when

Every fallback is an option with a test or a closed row with a trigger test.
