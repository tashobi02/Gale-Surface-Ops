---
name: judging-ready-submission
description: Manual workflow to draft NASA Space Apps project-page fields (High-Level Summary, Project Demo, Final Project, Project Details, GitHub/Drive access, Use of AI, NASA data sources, References) and check coverage against the score sheet and video rules. Draft only, never submits. Use when preparing the final submission (due 13 Nov 2026).
disable-model-invocation: true
---
Owners: [submission checklist](../../../docs/ops/submission-checklist.md), [06 TASK-16/17](../../../docs/specs/06_High_Level_Implementation_Plan.md#c-work-packages), [demo script](../../../docs/ops/demo-script.md), [docs/AI_USE.md](../../../docs/AI_USE.md), [ADR-006](../../../docs/decisions/ADR-006-no-ai-in-mvp.md).

## 0. Official guides first
The values below are from the Build Guide and Participants Guide, project files not in this repo (supplied by the user; Claude has not read the originals). The official 2026 Project Submission and Judging guides (due 13 Nov 2026) override them. Ask the user for the guides' paths. If they are not available, **warn at the top of the output** that fields, score sheet and AI-disclosure wording come from the earlier guides and may be out of date. The Build Guide's judging-ready-submission template was not read; the in-app-agent content it may contain is dropped (no AI in the MVP).

## 1. Project page fields: draft each (reply text, or `docs/ops/` if asked)
- **High-Level Summary**: name, what was built, who it helps, how it works, plus the 240-s video link and GitHub link. Source: 01 §A, `docs/reference/challenge-overview.md`.
- **Project Demo**: the 30-s video.
- **Final Project**: repository and full documentation.
- **Project Details**: the why, what and how with every dataset; community involvement and features; tools and credits. Include the prototype boundary (01 §F.1). Claim only what is implemented (phase gate, CLAUDE.md §3).
- **GitHub or Drive access**: public, tested in a private window.
- **Use of AI**: every tool named, prompts and reasoning, the data the AI worked on. The app has no AI in the MVP (ADR-006, 02 §D.7); describe build-time use from `docs/AI_USE.md` only.
- **NASA data sources used**: each dataset, what it was used for and how (manifest `sources`, SCR-09, 02 Sources). Only datasets actually used.
- **References**: every source, paper, dataset, library and asset (02 Sources; NFR-07 credits).
Links come from the user; never invent them.

## 2. Coverage
- **Score sheet**: 1–20 each: Impact, Creativity, Validity, Relevance, Presentation. 1–5 each: Teamwork, User experience, NASA data usage. 0 or 1 each: challenge category named, repository open, project page submitted. For each criterion cite the evidence in the repo or videos, and gaps.
- **Videos**: 240-s local judging video due 13 Nov 18:30 (confirm with the Local Lead; the guide has a conflicting date). 30-s global video, target 14 Nov 09:00, hard cut-off 12:00. English subtitles, datasets named on camera, no under-18 likeness. Also check the prototype boundary appears (01 §F.1).
- **AI disclosure**: valid reason for using AI, prompts explained, the team's own creative work shown, every generating tool named.

## 3. AI_USE.md audit
It must name every AI tool, the prompts and reasoning, and what the team did itself. Use only what the log records. List each `TODO` / `TODO(verify)` / `TODO(decision)` as a gap for the team (tool versions, "Used by", human review, prompt location).

## Never
Fabricate team contributions, datasets, results or links. Submit anything or change repo visibility. Commit.

## Manual checks for the user
Open the repo in a private window · clean-clone build with documented commands · `/rehearse-offline` · videos play, subtitles on · links tested · confirm the 240-s date with the Local Lead.
