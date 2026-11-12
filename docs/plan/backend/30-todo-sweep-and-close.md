# 30 — Marker sweep, ratifications and close-out (last)

| | |
| --- | --- |
| **Subtasks** | ratification notes of BD-04, BD-20, BD-48, BD-70 … BD-74, BD-109 in code and task files; final status reconciliation |
| **Depends on** | every other backend package |
| **Branch** | `be/30-sweep` |
| **Spec refs** | CLAUDE.md §6; [decisions-index.md](decisions-index.md) |

## Steps

1. Run `python3 scripts/check_todos.py`. For every remaining marker, find its row in [decisions-index.md](decisions-index.md) by file and excerpt, re-read it in context, and replace the marker with `Decided: BD-nn (orchestrator, 12 Nov 2026)` plus the one-line rule, or — for BD-04 rows — rewrite the sentence without the marker (past tense with evidence, or "write *unknown* with the reason"). If the mapped id does not fit, use the right id and correct the index row in the same commit.
2. Task files: in each TASK file of the scope, the "Proposed … TODO(decision)" blocks become "Decided (BD-nn, 12 Nov 2026)"; no requirement text in `docs/specs` is touched here.
3. Reconcile `docs/tasks/status.md`: every subtask listed in [00-overview.md](00-overview.md) §2 has a `done` row with evidence (or, for a frontend-owned id, is left to the frontend plan); `make progress`.
4. `docs/AI_USE.md`: one row per backend package (check none is missing).
5. `graphify update .` (code) and, because docs changed, `/graphify .` if the tool is available; commit `graphify-out/GRAPH_REPORT.md` only.

## Automated verification

- `python3 scripts/check_todos.py` exit 0.
- `make lint typecheck test docs-check`; `python3 scripts/check_tasks.py`.
- `grep -c "| done |" docs/tasks/status.md` increased by the number of backend subtasks closed (printed in the commit body).

## Done when

No marker remains in scope and every backend subtask has a `done` row.
