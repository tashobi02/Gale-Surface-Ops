# ADR-006 — No AI in MVP (D-06)

| | |
| --- | --- |
| **Owner** | Architecture — owning spec: [02 §D.7 AI](../specs/02_Technical_Requirements_Document.md#d7-ai) |
| **Date** | 2026-11-02 |
| **Status** | Proposed |
| **Related** | [Docs index — major proposed decisions](../README.md#major-proposed-decisions) · [01 §C.3 Post-MVP](../specs/01_Product_Requirements_Document.md#c4-post-mvp) · [01 §C.4 Explicitly out of scope](../specs/01_Product_Requirements_Document.md#c5-out-of-scope) · [AI use log](../AI_USE.md) |

This record mirrors D-06 from the docs index. The owning spec is the source of truth: if they disagree, the spec wins and this file is updated.

## Decision

No AI in MVP.

## Alternative / trigger

Post-MVP narration grounded in plan JSON only.

## Resolution path

- 02 §D.7: "If added post-MVP: narration only, input = the plan JSON, output blocked if it contains any number absent from the JSON; fallback = static template text."
