# ADR-004 — Least-time A* routing (D-04)

| | |
| --- | --- |
| **Owner** | Architecture — owning spec: [02 §D.2 Route planning](../specs/02_Technical_Requirements_Document.md#d2-route-planning-fr-06-fr-07-fr-10) |
| **Date** | 2026-11-02 |
| **Status** | Proposed |
| **Related** | [Docs index — major proposed decisions](../README.md#major-proposed-decisions) · [06 §D.4 Cut list](../specs/06_High_Level_Implementation_Plan.md#d4-cut-list-cut-in-this-order-when-behind) · [06 §D.3 Integration checkpoints](../specs/06_High_Level_Implementation_Plan.md#d3-integration-checkpoints) |

This record mirrors D-04 from the docs index. The owning spec is the source of truth: if they disagree, the spec wins and this file is updated.

## Decision

Least-time A* on a 5 m grid between user-ordered stops; hard slope limit; caution multipliers.

## Alternative / trigger

Manual polyline + validation (cut-list item 6).

## Resolution path

- 06 §D.3: walking skeleton at Day 1 12:30 is the "go/no-go on auto-routing".
- 06 §D.4 item 6: "Auto-routing → manual polyline + validation".

## Walking-skeleton evidence (T09.06)

The harness check `walking-skeleton` (`apps/web/e2e/checks/walking-skeleton.spec.ts`) runs the demo plan (SCR-01 "Open demo plan") on the **real** plan worker and records what it computed in `apps/web/e2e/out/walking-skeleton.json`. The measured run of 13 Nov 2026 on the F4 `mock_site`:

| | |
| --- | --- |
| Plan hash | `8f0f86c2a30c` |
| Result status | `OVER_LIMITS` (the walk is routed; a rule is exceeded) |
| Legs | `wp-0 → wp-1` OK, `wp-1 → wp-0` OK (the demo plan loops) |
| Totals | 5 974 m, 108.6 min walk, 128.6 min EVA, max walkback 2.99 km, max slope 0° |
| Warnings | `DARKNESS` (caution) — the sun is below the horizon at the check's start time |
| Worker timing | `total` 22.9 ms, `routing` 8.9 ms, `estimates` 4.3 ms |
| NFR-02 budget | full-grid haven field ≤ 2 000 ms (02 §F) — **met**, 22.9 ms of 2 000 ms |

What this run proves: the real worker loads the grid, routes every leg of the demo plan, returns a plan with totals and a profile, and does it far inside the NFR-02 budget. The elevation profile is drawn from the worker's own samples, so FR-08's chart has data on the F4 site.

What it does not yet prove: the M3 exit criterion of 06 §B — a **3-stop** route over the **real** site — because the F4 bundle holds one of the demo plan's three POIs, and the real site bundle (`gale_boxwork`) has no grid assets yet. The run on the real site needs N-20 (`scenarios/storm-sol4190/scenario.json` in the live shape, plus the `gale_boxwork` grid). The demo plan's two missing stops are named by SCR-01 itself, so no coordinate was invented for them.

**Status of the go/no-go: the auto-routing slice is go** on the evidence above (the worker routes and meets NFR-02 on every leg it was given). The final 3-stop confirmation on the real site stays open until N-20 lands; the fallback claims (T05.30, T09.08) are not claimed. The human confirmation of this record is with the team lead and the product & systems lead, as 06 §D.3 requires.
