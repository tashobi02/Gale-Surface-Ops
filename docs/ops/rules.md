# Rules check (TASK-00)

| | |
| --- | --- |
| **Owner** | Story lead ([06 §C TASK-00](../specs/06_High_Level_Implementation_Plan.md#c-work-packages)) |
| **Date** | 2026-11-04 |
| **Status** | Resolved 2026-11-04 → Track P (permissive). Registration confirmed. Local Lead's message quoted. Only the 2026 Submission / Judging guides remain unchecked (due 13 Nov) |
| **Related** | [Docs index](../README.md#key-assumptions-and-blockers) · [06 §A Planning assumptions](../specs/06_High_Level_Implementation_Plan.md#a-planning-assumptions) · [01 §F.3 Risks](../specs/01_Product_Requirements_Document.md#f3-risks) |

## Question

Is application code allowed to be written before the Bangladesh hackathon starts on 13 Nov 2026? (U-12, which decides Track S vs. Track P in [06 §A](../specs/06_High_Level_Implementation_Plan.md#a-planning-assumptions).)

## Sources to check

- [x] Space Apps rules page (01 §F.3 and 06 §E name "spaceappschallenge.org/legal"); checked by the team owner, 2026-11-04; the exact URL and quotes are not recorded here
- [x] Dhaka Local Lead (06 §E) — answered, see Answer
- [x] Space Apps Challenge Participants Guide (Bangladesh; not in this repo); checked by the team owner, 2026-11-04
- [ ] Project Submission / Judging guides 2026 (not yet published; due 13 Nov per the [docs index](../README.md#context-inventory))

## Answer

| Field | Value |
| --- | --- |
| Answer (verbatim quote) | "Yes, you work the main stuff and fine tune as much as possible until the resources are released" |
| Source (URL or person) | Dhaka Local Lead (Bangladesh), message quoted by Obidit Islam (team owner) on 2026-11-04 |
| Date obtained | 2026-11-04 |
| Recorded by | Claude Code, on the team owner's instruction (T00.03); the quote was supplied by the team owner |

## Registration (TASK-00 deliverable)

- [x] All members registered on the NASA Space Apps site (confirmed by the team owner, 2026-11-04)
- [x] All members registered on the Bangladesh form (confirmed by the team owner, 2026-11-04)

## Consequence

- Allowed → Track P: the TASK-02 spike and TASK-05 compute core may start before the event (06 §A).
- Not allowed, or no answer → Track S (06 §C TASK-00: "No answer → follow Track S").
- Either way, update the phase-gate line in `CLAUDE.md` and `AGENTS.md`.

### Recorded track (2026-11-04): Track P

- Application code may be written before 13 Nov.
- The answer says to "work the main stuff and fine tune as much as possible", which is wider than the two tasks 06 §A names for Track P. It does not list cases (tests, stubs, pipeline scripts), so which `event-only` subtasks (for example TASK-06 and the UI tasks) move into M0–M2 is `TODO(decision)` for the team; [_coordination.md](../tasks/_coordination.md) windows are not edited here.
- "Until the resources are released" refers to the 2026 Project Submission and Judging guides, due 13 Nov. Re-check this answer against them then; a change needs a `follow-up:` subtask on this file.
- `CLAUDE.md` §3 and `AGENTS.md` carry the phase-gate line for this track (T00.04, done 2026-11-04).
