# ADR-013 — Product name (D-08)

| | |
| --- | --- |
| **Owner** | Sadman Shaharier Mahim, product and systems lead; decision by the orchestrator (Claude) under his authority |
| **Date** | 2026-11-13 |
| **Status** | Decided (FD-006; 12 Nov 2026), search repeated 13 Nov 2026 |
| **Related** | [D-08](../specs/01_Product_Requirements_Document.md#f4-unresolved-decisions-owned-by-this-document) · [FD-006 and FD-159](../plan/frontend/decisions.md) |

This record mirrors D-08. The owning spec remains the source of truth.

## Decision

The product name is **Gale Surface Ops**. It identifies the selected Gale crater site and keeps the surface-operations framing.

## Search evidence

On 2026-11-13, `gh search repos "Gale Surface Ops" --limit 20 --json fullName,createdAt` returned `[]`. No repository was returned by that search, so the first choice meets FD-006's rule. This is evidence from the search, not a trademark clearance.

## Alternatives and resolution

The former working name Marswalk Surface Ops clashed with five 2026 repositories, recorded in [T16.01](../tasks/TASK-16_submission-package.md). FD-006 lists Sharpwalk and Habline as fallbacks if a 2026 repository uses Gale Surface Ops; neither fallback was needed. ADR-008 already records the Hab Core decision, so this name decision uses ADR-013 (FD-195).
