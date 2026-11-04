---
description: List the screens, modules, schema entities, tasks and tests that reference an FR id
argument-hint: FR-xx
---

# Trace an FR id

Trace requirement **$ARGUMENTS** through the repo. Read only; change nothing.

1. Read its definition in `docs/specs/01_Product_Requirements_Document.md` and its row in the traceability table of `docs/README.md`.
2. Search for `$ARGUMENTS` (exact id; also its range forms such as `FR-07–FR-12`) in `docs/specs/`, `docs/decisions/`, `apps/web/src/`, `apps/web/tests/`, `pipeline/`, and `schemas/`. Prefer `graphify query "$ARGUMENTS"` first if `graphify-out/graph.json` exists, then confirm by opening the files.
3. Report one table with columns: Kind (screen / module / entity / task / test / doc), Location (`path:line`), Note. Screens are SCR-xx from 03 §B; entities come from 05 §A; tasks from 06 §C.
4. List gaps: anything the traceability table names that has no matching module, stub or test, and anything in code that cites the id but is missing from the table.
