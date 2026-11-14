# Submission checklist

| | |
| --- | --- |
| **Owner** | Story lead ([06 §C TASK-16, TASK-17](../specs/06_High_Level_Implementation_Plan.md#c-work-packages)) |
| **Date** | 2026-11-13 |
| **Status** | Submitted — completion confirmed by Obidit Islam on 13 November 2026; see the [submission record](submit-now.md#submission-confirmation) |
| **Related** | [06 §B M6](../specs/06_High_Level_Implementation_Plan.md#b-milestones) · [06 §D.6 Demo freeze criteria](../specs/06_High_Level_Implementation_Plan.md#d6-demo-freeze-criteria-day-2-0600) · [Demo script](demo-script.md) · [AI use log](../AI_USE.md) |

The team lead confirmed that the videos and all other project materials have been submitted. This checklist records the submitted deliverables and distinguishes that confirmation from independent technical verification. Requirement text and acceptance criteria remain in the owning task files.

## Submission completion

- [x] Video deliverables submitted (T17.01–T17.03), confirmed by the team lead.
- [x] [Submitted video link](https://www.youtube.com/watch?v=ovzdp5B8Hh8&feature=youtu.be) recorded; the supplied link does not identify its duration.
- [x] Project materials and final portal submission completed (T16.06, T30.01), confirmed by the team lead.
- [x] Main-branch runtime source archive prepared with a project/navigation README and the complete Gale site bundle.
- [x] Archive dependency installation, build, TypeScript checks, server startup, role connection, data integrity and reference replay verified; evidence in the [submission record](submit-now.md#submission-confirmation).

## Deadlines (06 §A, Confirmed)

- 240-s local-judging video — 13 Nov 18:30
- 30-s video upload — 14 Nov 09:00; hard cut-off 12:00
- Demo freeze — 14 Nov 06:00 (06 §D.3)
- Local judging from 14 Nov 11:00

These are the recorded schedule, not evidence of exact upload times or completion of future judging.

## Videos (06 TASK-17)

The team accepted and submitted the videos. English subtitles, on-camera dataset names, no under-18 likeness, the prototype boundary statement and upload-link checks remain the TASK-17 acceptance criteria. This documentation update does not independently certify the final uploaded video's content or playback; prior local capture evidence remains in the [verification log](verification-log.md).

## Repository and package (06 TASK-16, M6)

- [x] README with run instructions and data credits (NFR-07).
- [x] Apache-2.0 `LICENSE` included.
- [x] AI-use disclosure included in the submission; the development log remains [AI_USE.md](../AI_USE.md).
- [x] Dataset and image credits included in the README and site records.
- [x] Submitted main-branch source package builds and serves with the documented npm commands.

The repository remains private under the team's archive-submission decision. Public repository/Pages access, historical AI-log audit gaps and final hosted-link verification are still tracked separately in [task status](../tasks/status.md); they are not inferred from successful submission.

## NASA project page fields

- [x] Portal form and project materials submitted, confirmed by the team lead; the portal URL and confirmation ID were not supplied.

## Bangladesh score sheet

Submission completion does not independently establish a judging score. The score-sheet evidence audit remains recorded under T30.03.

## Human evidence handover

The [team's submission confirmation](submit-now.md#submission-confirmation) remains the evidence of submission; these checks do not assert publication, access or a judging score.

### T16.07 — Public access

1. The team decides whether and when to publish. Before changing visibility, run `gitleaks detect --source .` and resolve findings; review GitHub's visibility-change consequences. Check current visibility with `gh repo view tashobi02/CheesySpace-NasaSpaceAppChallenge --json visibility,url`.
2. If the team elects to publish, an authorized owner makes the repository public in its GitHub Settings → General → Danger Zone. Configure Pages using the repository's deployment workflow and record its actual published URL; do not guess one.
3. In a signed-out private window open [the repository](https://github.com/tashobi02/CheesySpace-NasaSpaceAppChallenge), the actual Pages `#/replay` URL, and the actual release asset link. Verify replay loads and the bundle downloads. Follow [hosting](hosting.md#3-team-release-asset-fetch-route) to verify the bundle hash and contents.
4. Append dated URLs, results, screenshots and verifier to [verification log](verification-log.md). A human closes T16.07 only after its acceptance criteria are met.

### T16.04 — Disclosure

1. Open the current 2026 Project Submission and Judging guides from the [Space Apps portal](https://www.spaceappschallenge.org/); record the actual guide URLs, revision, date and applicable AI disclosure wording. The exact guide URLs have not been established here.
2. Ask each contributor to confirm tool, model/version, purpose and user against [AI use](../AI_USE.md); confirm the operator-local prompt location (FD-544).
3. For each historical unknown or incomplete cell, append a dated row naming the original row and the contributor's confirmed answer; leave the original unchanged. Compare the disclosure with ADR-006 and SCR-09. Record guide audit and human approval in a new log row.
4. Run `make lint docs-check` and inspect `git diff -- docs/AI_USE.md` for additions only. A human closes T16.04 after the task acceptance is met.

### T30.02 — AI-use sweep

1. Run `git log --all --no-merges --format='%h %ad %an %s' --date=short` and compare each AI-assisted commit with [AI use](../AI_USE.md); ask authors to identify assistance where commit messages are inconclusive.
2. Ask each author to append missing entries, historical answers and human review details; do not change existing rows. Complete the guide audit in T16.04 and record the comparison and reviewer in [verification log](verification-log.md).
3. A human closes T30.02 once every AI-assisted commit is accounted for.

### T30.03 — Scoring evidence

1. Open the team project in the [Space Apps portal](https://www.spaceappschallenge.org/) and record its actual URL, challenge name and completeness; do not infer a portal ID or timestamp from the team confirmation.
2. In a signed-out private window independently open that project, the [supplied video](https://www.youtube.com/watch?v=ovzdp5B8Hh8&feature=youtu.be), the repository, the actual Pages replay URL and bundle link. Record each actual URL, access result, date and screenshot; follow T16.07 for publication if needed.
3. Check DONKI/CCMC, NAIF and ESA SPICE credits against [credits](credits.md) and the project materials. Append the links or screenshots and verifier to [verification log](verification-log.md). A human closes T30.03 only when the task's three points have evidence; no score is claimed.

### Remaining UI integration evidence

The following placeholders are not evidence that the backend lacks every underlying capability:

- SCR-09 ParamSets and dose-series source (N-30): `scenario_meta` is supplied by `/api/session` and SCR-09 reads it (T12.03, T16.05).
- SCR-16 delayed crew, alerts and as-of time (N-130): `/api/earth-view` supplies them and SCR-16 reads them, each field with its own provenance (T18.12).
- SCR-07 seasonal weather (N-24): the offline REMS builder writes `rems_context.json` into the site bundle and SCR-07 reads the bin for the plan's L_s (T18.02, T18.03).
- SCR-05 and SCR-08 illustrative oxygen rate (N-24): compute exports the estimate and constants and both panels show them (T18.06).
- EVA and ops haven bands (N-100/N-120): `/api/hab-time-field` is read by the client; the client never computes a cell value itself.
- SCR-02 manual plan totals (N-160): a one-leg worker result is displayed; authoritative full-plan aggregation is still missing. The real site's optional static PNG fallback was not built (BD-160).

Other conditional dashes represent absent session, route, telemetry, map assets or unavailable report fields and must retain their source and unavailable state until supplied. This list records confirmed integration gaps; it is not an exhaustive verification of every placeholder.
