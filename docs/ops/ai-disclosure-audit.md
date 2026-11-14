# AI-Use Disclosure Audit & Contributor Readiness (T16.04 / T30.02)

| | |
| --- | --- |
| **Owner** | Story lead / Team lead · Obidit Islam ([06 §C TASK-16](../specs/06_High_Level_Implementation_Plan.md#c-work-packages)) |
| **Date** | 2026-11-14 |
| **Status** | Prepared for human audit — live 2026 external guide text not fetched (TLS verification failed in this environment) |
| **Related** | [Submission checklist](submission-checklist.md#t1604--disclosure) · [AI use log](../AI_USE.md) · [Project page text](project-page.md#ai-use-statement) · [ADR-006](../decisions/ADR-006-no-ai-in-mvp.md) · [Team roster](team.md) |

## Live 2026 guide check

- **Reachability from this environment:** Not verified. Outbound HTTPS probes to `https://www.spaceappschallenge.org/` from both `python3` and `curl` failed TLS verification (`unable to get local issuer certificate`), so the live 2026 Project Submission Guide and Judging Guide have **not** been fetched or read here.
- **Required human action:** A team member with browser access must open the current 2026 guides on the [Space Apps portal](https://www.spaceappschallenge.org/) and record the exact guide URLs, revision date, and required AI disclosure wording per [submission-checklist.md](submission-checklist.md#t1604--disclosure).

## Question-by-question disclosure readiness table

This table maps the disclosure questions tracked in [T16.04](../tasks/TASK-16_submission-package.md#t1604--complete-the-ai-use-disclosure) and [submission-checklist.md](submission-checklist.md#t1604--disclosure) against the repository's current text. It does not claim approval or live-guide compliance.

| Disclosure question | Repo's current answer | Where the answer lives | Human confirmation needed |
| --- | --- | --- | --- |
| Does the runtime application use AI? | No. "No AI computes or generates values in this app." All routing, physics, dosimetry, Mars24, and timeline algorithms are deterministic. | [SCR-09](../../apps/web/src/ui/content/methods.json), [03 SCR-09](../specs/03_App_Flow_and_Diagrams.md#scr-09--sources--methods), [ADR-006](../decisions/ADR-006-no-ai-in-mvp.md), [AI_USE.md](../AI_USE.md), [project-page.md](project-page.md#ai-use-statement) | Confirm against the live 2026 Project Submission and Judging guides' AI-usage wording (`AI_USE.md` line 12 still carries `Final disclosure wording: TODO(verify)`). |
| Which AI tools and models/versions were used during development? | `project-page.md` lists Claude (Claude Code: Claude Sonnet 5.5, Opus 5.5, Opus 4.8 via puku CLI; claude.ai), OpenAI GPT-6.1 Sol, GPT-6.1 Terra, GPT-6 Astra (Codex CLI), and Google Gemini 3.8 Flash (agy CLI). `AI_USE.md` `## Tools` currently lists only 3 rows (`Claude Code claude-opus-5-5`, `Antigravity Gemini`, `Claude Opus 5.5`), whereas the 516 `## Log` rows also record `Claude Code` (`Haiku 5.5`, `Opus 4.6`, `Opus 4.8`, `Sonnet 5.5`), `Codex` (`GPT-6`, `Luna 6`, `GPT-6.1 Sol`, `GPT-6.1 Terra`, `GPT-6 Astra`), `Gemini` (`3.8 Flash`, `4 Argon`, `4 Hydrogen`), `Puku CLI` (`puku-ai-2.7`), and `GitHub Copilot` (`copilot-swe-agent[bot]`, row 266). | [AI_USE.md Tools](../AI_USE.md#tools), [AI_USE.md Log](../AI_USE.md#log), [project-page.md](project-page.md#ai-use-statement) | Reconcile `AI_USE.md` `## Tools` (fill `Used by` on line 18, currently `TODO`, and add missing tools/models) and align `project-page.md` if `Haiku 5.5`, `Opus 4.6`, `Luna 6`, `Gemini 4 Argon/Hydrogen`, `Copilot`, or `Puku CLI` should be named explicitly. |
| Who used each AI tool, and for what purpose? | `AI_USE.md` `## Tools` names Obidit Islam and Sadman Shaharier Mahim; row 18 (`Claude Code / claude-opus-5-5`) has `Used by` = `TODO`. `## Log` attributes changes across contributors and orchestrator sessions. | [AI_USE.md Tools](../AI_USE.md#tools), [AI_USE.md Log](../AI_USE.md#log) | Each of the 6 team members confirms which tools/models they used and fills row 18 `Used by` (`TODO`). |
| Where are prompts and session transcripts kept? | Operator-local CLI and agent session logs outside the Git repository (`docs/ai-prompts/` is not used) so histories and credentials stay local (FD-541 / FD-544). | [AI_USE.md Prompts location](../AI_USE.md#prompts-location) | Confirm every contributor retains or can cite their local session logs as required by the live 2026 guides, and resolve `TODO(decision)` / `TODO` cells in earlier `## Log` rows via appended rows. |
| What boundaries and human oversight applied? | No AI-computed science numbers; deterministic compute/pipeline only; human-directed decisions and reviews logged in `Human review`. | [CLAUDE.md §2](../../CLAUDE.md#2-non-negotiables), [AI_USE.md](../AI_USE.md#log), [project-page.md](project-page.md#ai-use-statement) | Confirm human review on historical `## Log` rows that still contain `TODO` / `TODO(verify)` / `TODO(decision)` (114 rows of 516 currently contain a `TODO` token). |
| Does the log cover every AI-assisted commit in git history (T30.02)? | Automated sweep (`python3 scripts/check_ai_use_log.py`) against `HEAD` (728 non-merge commits, 516 log rows) covers 705 commits and flags 15 uncovered AI-trailered commits, 8 uncovered untrailered commits, 1 unmatched log row (`#222` merge note), 2 cited SHAs outside `HEAD` (`5d80664`, `fa25bee`), and 3 cited paths missing from git history. | [check_ai_use_log.py](../../scripts/check_ai_use_log.py), [AI_USE.md](../AI_USE.md#log) | Authors review the flagged uncovered commits and append missing rows (and human-review confirmations) to `docs/AI_USE.md` without editing existing rows. |

## Contributor confirmation form (for human completion)

Send or collect answers from the six registered members ([team.md](team.md)) before closing **T16.04** and **T30.02**.

### Part A — Per-contributor tool & prompt confirmation

| Member | Tools & models used (confirm/edit) | Primary purpose in repo | Prompt / transcript location confirmed? | Sign-off & date |
| --- | --- | --- | --- | --- |
| **Obidit Islam** (`@tashobi02`) | `[ ]` Claude Code (`Opus 5.5` / `Sonnet 5.5` / `Opus 4.8`) `[ ]` Codex (`GPT-6` / `GPT-6.1` / `Luna 6`) `[ ]` Antigravity (`Gemini 3.8 Flash` / `4 Argon` / `4 Hydrogen`) `[ ]` Puku CLI (`puku-ai-2.7`) `[ ]` Other: ____ | Data pipeline, GIS, submission, frontend lane orchestration | `[ ]` Operator-local logs retained (FD-544) / Other: ____ | ____ |
| **Sadman Shaharier Mahim** (`@deatrax`) | `[ ]` claude.ai (`Opus 5.5`) `[ ]` Claude Code (`Opus 5.5` / `Sonnet 5.5` / `Opus 4.8`) `[ ]` Codex (`GPT-6` / `GPT-6.1`) `[ ]` Puku CLI `[ ]` Other: ____ | v2 specs, Hab Core, compute integration, product/systems | `[ ]` Operator-local logs retained (FD-544) / Other: ____ | ____ |
| **Saba Atharique** (`@saba03`) | `[ ]` None `[ ]` Tool/model: ____ | Frontend / design & story | `[ ]` N/A / Operator-local logs retained: ____ | ____ |
| **Mishkat Ahmed Khan** (`@mishkat17`) | `[ ]` Antigravity (`Gemini`) `[ ]` GitHub Copilot (`copilot-swe-agent[bot]`) `[ ]` Other: ____ | Compute engine, Mars24/sun/radiation, data/GIS | `[ ]` Operator-local logs retained (FD-544) / Other: ____ | ____ |
| **Anjim Hossain** (`@lazymeow`) | `[ ]` Antigravity (`Gemini`) `[ ]` Other: ____ | Compute v2 (link graph, Earth link, radiation) | `[ ]` Operator-local logs retained (FD-544) / Other: ____ | ____ |
| **Ridita Alam** (`@r_a110`) | `[ ]` Antigravity (`Gemini`) `[ ]` Other: ____ | Frontend (EVA tablet, HUD, ops task UI, report) | `[ ]` Operator-local logs retained (FD-544) / Other: ____ | ____ |

### Part B — Questions on uncovered commits and historical `TODO` cells

1. **Row 18 (`## Tools`) user:** Who used `Claude Code / claude-opus-5-5` for the 2026-11-02 repo organization, doc normalization, and skeleton stubs?
2. **Uncovered AI-trailered commits (15 flagged by `scripts/check_ai_use_log.py`):** Confirm tool, scope, boundaries, and human reviewer for:
   - `2026-11-02`: `b785ab3`, `9da5c90`, `043a423`, `2807ed9`, `c36a6cb`, `4c8c490`
   - `2026-11-06`: `840b7b8`
   - `2026-11-12`: `075e579`, `a49ec44`, `4562bd0`
   - `2026-11-13`: `0e2410d`, `4e0c4de` (row consolidated into `T13.07` / `FD-420–424` without `T13.08` in `What AI did`), `080ee81`, `08ca430`
   - `2026-11-14`: `72ca175`
3. **Uncovered untrailered commits (8 flagged):** Confirm whether each was human-only (no AI row needed) or AI-assisted (append row):
   - `2026-10-29`: `d2f9335` (`Initial Commit`)
   - `2026-11-03`: `858dee5`, `a83f182`, `88125b0`
   - `2026-11-08`: `a698419`, `4280acb`
   - `2026-11-11`: `fda9bc6` (`incomplete`)
   - `2026-11-13`: `4040266` (`FD-519`)
4. **Historical `TODO` cells & reverse-check notes:** Append dated clarification rows in `docs/AI_USE.md` for:
   - Row 27 (`2026-11-02`, `Tool` / `What AI did not do` / `Human review` / `Prompts` marked `TODO` / `TODO(verify)`) and the remaining historical `TODO` / `TODO(verify)` / `TODO(decision)` cells (114 rows total).
   - Row 514 (`line 545`): cited paths `apps/web/tests/ui/demoPlan.ts` and `apps/web/tests/ui/scr05RouteResults.ts` (files are `.test.ts`, not `.ts`).
   - Row 515 (`line 547`): cited old broken path `apps/web/tests/ui/fullScreenMap.test.ts` (notes the fixed target `apps/web/tests/ui/map/fullScreenMap.test.ts`).
   - Row 328 (`line 353`): describes PR `#222` merge commit `afb48cc` (skipped by `--no-merges`, while `a4242cc` already matched row 327).
   - Rows 293 & 488 (`5d80664`, `fa25bee`): confirm whether noting them as historical non-`HEAD` commits in git's object database is sufficient.
5. **Final human approval:** Confirm the live 2026 guide wording matches the disclosure and record human approval in `docs/AI_USE.md` and `docs/ops/verification-log.md`.
