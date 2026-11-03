# AI use log

| | |
| --- | --- |
| **Owner** | Story lead ([06 §C TASK-16](specs/06_High_Level_Implementation_Plan.md#c-work-packages)) |
| **Date** | 2026-11-02 |
| **Status** | Template — keep updated with every AI-assisted change |
| **Related** | [ADR-006 No AI in MVP](decisions/ADR-006-no-ai-in-mvp.md) · [03 SCR-09 AI-use statement](specs/03_App_Flow_and_Diagrams.md#scr-09--sources--methods) · [Submission checklist](ops/submission-checklist.md) |

The app itself uses no AI: no AI computes or generates values ([02 §D.7](specs/02_Technical_Requirements_Document.md#d7-ai), [01 §C.4](specs/01_Product_Requirements_Document.md#c4-explicitly-out-of-scope)). This log covers AI tools used to *build* the project.

Final disclosure wording: TODO(verify) against the 2026 Project Submission / Judging guides (not yet published; due 13 Nov).

## Tools

| Tool | Model / version | Used for | Used by |
| --- | --- | --- | --- |
| Claude Code | claude-opus-5-5 | Repo organization, doc normalization, skeleton stubs | TODO |
| TODO | | | |

## Log

| Date | Tool | What AI did | What AI did not do | Human review | Prompts / transcripts |
| --- | --- | --- | --- | --- | --- |
| 2026-11-02 | TODO(verify) | Drafting of `docs/specs/01–06` and `docs/README.md` (the context inventory names claude.ai Project attachments) | TODO(verify) | TODO | TODO |
| 2026-11-02 | Claude Code | Moved and normalized docs (header tables, links, lint); fixed two export defects in the science reference; wrote ADR and ops templates from existing spec text; created stub-only project skeleton and tooling | Did not change requirement text, numbers, IDs or labels; wrote no application logic; generated no displayed values | TODO | TODO(decision) |
| 2026-11-02 | Claude Code | Vendored ECC orch-* pipeline files and spec-kit review commands; ran `/speckit.analyze` + `/speckit.clarify` on docs/specs and applied the fixes listed in 01 Clarifications and the commit message; updated schemas and `schema.ts` to match | Did not change requirement ids or status labels; spec decisions (video deadline, manifest assets, tablet scope, briefing access) were chosen by the user | TODO | TODO(decision) |
| 2026-11-03 | Claude Code | Drafted `docs/tasks/_coordination.md` (Phase 1 of the atomized task plans: subtask register, path ownership, contracts, fixtures, dependency graph, lanes board) from `docs/specs/01–06` and the repo skeleton | Did not change specs, code, schemas or tests; added no numbers beyond those quoted from the specs; left open choices as `TODO(decision)` / `TODO(verify)` | Approved by the user 2026-11-03 | TODO(decision) |

## Prompts location

TODO(decision): where prompts and transcripts are stored (for example `docs/ai-prompts/`).
