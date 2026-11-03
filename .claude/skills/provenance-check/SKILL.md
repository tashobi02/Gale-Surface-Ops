---
name: provenance-check
description: Audit UI code for displayed metrics that break NFR-05 / FR-15 — every shown value needs data-provenance set to measured, derived, modelled or assumed plus a source id. Use when editing web/src/ui, before a demo freeze, or when asked to check provenance labels.
paths: ["web/src/ui/**"]
---
Read-only audit. Edit nothing unless the user asks. Owners: [01 FR-15](../../../docs/specs/01_Product_Requirements_Document.md#fr-15--provenance-and-methods), [02 §F NFR-05](../../../docs/specs/02_Technical_Requirements_Document.md#f-nonfunctional-requirements-and-validation), [05 Layer and "Distinctions the schema enforces"](../../../docs/specs/05_Backend_and_Database_Schema.md#distinctions-the-schema-enforces), [TASK-12](../../../docs/tasks/TASK-12_sources-methods-provenance.md).

## 1. Static review
Scan `web/src/ui/screens/*.ts` (SCR-00…09) and any other file under `web/src/ui/` that renders numbers (template strings, `textContent`, `innerHTML`, units like `km`, `min`, `°`, `mSv`).
For each rendered value check:
- the element has `data-provenance` ∈ {measured, derived, modelled, assumed} (type: `Provenance` in `web/src/types/schema.ts`);
- it has a source id (attribute name is set by contract C10 in `web/src/ui/context.ts`; TODO: confirm, file does not exist yet);
- the label is not hard-coded where the value comes from a manifest/result field that already carries `provenance` or `source_ids`.

## 2. Automated check
The planned DOM test is `web/tests/ui/provenance.test.ts` (T12.02). As of writing neither it nor `web/src/ui/components/metric.ts` exists, and `web/tests/` has only `compute/`. If the test is still missing, say "no automated NFR-05 coverage" in the report. Never claim coverage. If it exists, run `make test` and report skipped screens by name.

## 3. Classify (do not guess)
Use only these sources: layers → `Layer.provenance` in the manifest (elevation, ortho, TI = measured; slope, flags = derived; flags LOW_TI/HARD_HAZARD are interpretive); scenario defaults → `assumed` (05 MissionScenario); `EnvConstant` → its own `provenance`; computed results → `PlanResult.provenance_summary`.
If none applies, mark it `NEEDS HUMAN`. Known open cases (TASK-12 spec questions 2–3, TODO(decision)): data version, plan hash, sol labels, scale bar, coordinate readout, `?debug=1`, dataset resolution fields.

## Report
One row per finding: `file:line | value | problem | suggested label`. Suggested label is one of the four words, or `NEEDS HUMAN (reason)`. End with counts: checked, OK, findings, needs-human, and the automated-test status.
