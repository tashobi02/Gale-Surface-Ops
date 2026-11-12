# 20 — Post-EVA report: remaining reductions, planned background dose, trace

| | |
| --- | --- |
| **Subtasks** | T27.01, T27.02 |
| **Depends on** | 01a (type in protocol), 13 (`estimateDose` inputs), 17 (server chain) |
| **Branch** | `be/20-report` |
| **Spec refs** | 01 FR-46, FR-50; 05 PostEvaReport (after package 02); decision BD-76 |

## Files

`apps/hab-core/src/report.ts` (re-export the protocol type; fill new fields) · `apps/hab-core/tests/report.test.ts` (turn the three `it.todo`s into tests; add dose and trace cases) · `apps/hab-core/src/session.ts` (30 s trace sampled from state; rebuilt on resume) · `apps/hab-core/src/server.ts` (`/api/report` unchanged path; returns the full type)

## Steps (tests first)

1. Tests: planned vs actual stop timing per crew; shelter response per (alert, crew); dropped-stop identity by `stop_id`; `planned_background_ugy` equals compute `estimateDose(EnvConstant for the scenario's solar phase, plan totals duration)` and is null with a reason when missing; trace has one point per 30 sim-s per crew, identical after a kill-and-resume; report deterministic (same log → same JSON).
2. Implement; `GET /api/log` without `after` returns the whole log, `?download=1` adds the attachment header (N-10).

## Automated verification

`npm --workspace @marswalk/hab-core test -- report server session`.

## Status rows

```text
| T27.02 | done | <commit date> | report.test.ts: no it.todo left; dose and trace cases |
| T27.01 | done | <commit date> | report builder complete (planned background dose, trace per U-24/BD-76); GET /api/report returns the protocol PostEvaReport |
```

## Done when

Every report value is reduced from the log or computed by compute, with provenance.
