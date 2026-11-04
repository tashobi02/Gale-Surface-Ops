# AI use log

| | |
| --- | --- |
| **Owner** | Story lead ([06 §C TASK-16](specs/06_High_Level_Implementation_Plan.md#c-work-packages)) |
| **Date** | 2026-11-04 |
| **Status** | Template — keep updated with every AI-assisted change |
| **Related** | [ADR-006 No AI in MVP](decisions/ADR-006-no-ai-in-mvp.md) · [03 SCR-09 AI-use statement](specs/03_App_Flow_and_Diagrams.md#scr-09--sources--methods) · [Submission checklist](ops/submission-checklist.md) |

The app itself uses no AI: no AI computes or generates values ([02 §D.7](specs/02_Technical_Requirements_Document.md#d7-ai), [01 §C.4](specs/01_Product_Requirements_Document.md#c5-out-of-scope)). This log covers AI tools used to *build* the project.

Final disclosure wording: TODO(verify) against the 2026 Project Submission / Judging guides (not yet published; due 13 Nov).

## Tools

| Tool | Model / version | Used for | Used by |
| --- | --- | --- | --- |
| Claude Code | claude-opus-5-5 | Repo organization, doc normalization, skeleton stubs | TODO |
| Antigravity | Gemini | Drafted `docs/ops/team.md` from team screenshots and public GitHub profiles | Obidit Islam (`@tashobi02`) |
| Claude (claude.ai Project "CheesySpace Nasa Space apps challenge") | Claude Opus 5.5 | v2 surface-ops specs 01–06, monorepo restructure, ADR-008–011, schemas, stubs, design tokens | Sadman Shaharier Mahim (`@deatrax`) |

## Log

| Date | Tool | What AI did | What AI did not do | Human review | Prompts / transcripts |
| --- | --- | --- | --- | --- | --- |
| 2026-11-02 | TODO(verify) | Drafting of `docs/specs/01–06` and `docs/README.md` (the context inventory names claude.ai Project attachments) | TODO(verify) | TODO | TODO |
| 2026-11-02 | Claude Code | Moved and normalized docs (header tables, links, lint); fixed two export defects in the science reference; wrote ADR and ops templates from existing spec text; created stub-only project skeleton and tooling | Did not change requirement text, numbers, IDs or labels; wrote no application logic; generated no displayed values | TODO | TODO(decision) |
| 2026-11-02 | Claude Code | Vendored ECC orch-* pipeline files and spec-kit review commands; ran `/speckit.analyze` + `/speckit.clarify` on docs/specs and applied the fixes listed in 01 Clarifications and the commit message; updated schemas and `schema.ts` to match | Did not change requirement ids or status labels; spec decisions (video deadline, manifest assets, tablet scope, briefing access) were chosen by the user | TODO | TODO(decision) |
| 2026-11-03 | Claude Code | Drafted `docs/tasks/_coordination.md` (Phase 1 of the atomized task plans: subtask register, path ownership, contracts, fixtures, dependency graph, lanes board) from `docs/specs/01–06` and the repo skeleton | Did not change specs, code, schemas or tests; added no numbers beyond those quoted from the specs; left open choices as `TODO(decision)` / `TODO(verify)` | Approved by the user 2026-11-03 | TODO(decision) |
| 2026-11-03 | Claude Code (19 parallel sub-agents, one per task file) | Wrote the 19 task files `docs/tasks/TASK-00…18_*.md` from the frozen coordination map; amended the map once (3 subtasks, extra cross-task edges, paths, open points); wrote `scripts/check_tasks.py` and the `docs/tasks/README.md` index, whose hour totals the script computes | Did not change specs, code, schemas or tests; chose no dataset, URL or science number (only effort estimates); left open choices as `TODO(decision)` / `TODO(verify)` | TODO | TODO(decision) |
| 2026-11-04 | Antigravity (Gemini) | Wrote `docs/ops/team.md` (T00.06 / U-13) from the NASA Space Apps team page and GitHub collaborator screenshots, plus public GitHub profile/repository metadata for all 6 team members | Did not alter specs, requirement IDs, code or tests; kept final lane sign-off as `TODO(decision)` and venue mode (`U-14`) as `TODO(verify)` | Reviewed by Obidit Islam | TODO(decision) |
| 2026-11-04 | Claude Code | Recorded the team owner's U-12 answer and Track P in `docs/ops/rules.md` (T00.03); rewrote the phase-gate line in `CLAUDE.md` and `AGENTS.md` (T00.04); updated 01 A-07 to a team of 6; ran a partial T16.02 sync (U-12, U-13) across 01, 06, `docs/README.md` and the capacity notes in `docs/tasks/`; wrote `scripts/update_progress.py`, `docs/tasks/status.md` and the README progress block, with the commit rule in `CLAUDE.md` / `AGENTS.md` | Did not change requirement ids; ticked registration, the sources checked and the Local Lead as source, and quoted the Lead's message, only after the team owner confirmed each; did not edit 06 §A, `docs/README.md` or `_coordination.md` (T16.02 sync) | Instructed by Obidit Islam; review TODO | TODO(decision) |
| 2026-11-04 | Claude (claude.ai, Opus 5.5) | In a planning chat with Sadman: reviewed the v1 specs, challenge text and organizer build guide; on the team's direction (in-EVA tablet/HUD, rover and vehicle tasking, reacting to solar events, habitat server, Exploration Zone framing, brutalist design) rewrote specs 01–06 as v2; restructured the repo into `apps/web`, `apps/hab-core`, `packages/compute`, `packages/protocol`, `data/sites`, `scenarios`; wrote type definitions, stubs and `it.todo` tests, design tokens, JSON Schemas (scenario, param set; v2 fields), assumed ParamSets for `storm-sol4190`, ADR-008–011, and updated CLAUDE.md, AGENTS.md, README, docs index, constitution and skills | Wrote no science implementation (all compute bodies are stubs); computed contrast ratios, horizon distances and light-time ranges with stated formulas; took the 20 May 2024 RAD and DONKI facts from cited web sources; left parameter values labelled `assumed`; did not change v1 requirement ids; kept v1 FR text and planner layout verbatim as appendices | Directed by Sadman Shaharier Mahim; team review TODO | Planning chat in the claude.ai Project (link TODO(decision)) |

## Prompts location

TODO(decision): where prompts and transcripts are stored (for example `docs/ai-prompts/`).
