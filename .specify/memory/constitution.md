# Marswalk Surface Ops Constitution

Principles already set by this repo, collected in spec-kit form so `/speckit.analyze`, `/speckit.clarify` and `/speckit.checklist` can check the specs against them. Each one cites where it comes from; this file adds no new rules.

## Core Principles

### I. No Internet at Runtime (NON-NEGOTIABLE)

The demo and every core feature MUST run with no internet: clients talk only to the Hab Core on the habitat LAN (or `localhost`). External sources are contacted only by the pre-event pipeline. (01 FR-01, FR-16, FR-30; 02 NFR-01, NFR-08; CLAUDE.md §2)

### II. Deterministic Science, No AI-Generated Numbers (NON-NEGOTIABLE)

All computed values MUST come from deterministic code in `packages/compute/` or `pipeline/`. No AI model may compute or generate a displayed number. Same inputs + same `data_version` MUST give identical results; the same scenario + seed MUST give the same event-log hash, so the Hab Core engine MUST NOT read wall-clock time. (01 §C.5; 02 §D.7, NFR-06; ADR-006)

### III. Provenance on Every Displayed Value (NON-NEGOTIABLE)

Every displayed value MUST carry a provenance label (`measured | derived | modelled | assumed | replayed | simulated`) and a source id, and every dataset and image MUST be credited. Nothing is presented as a live feed from Mars. (01 FR-15; 02 NFR-05, NFR-07)

### IV. Mars-Correct Geospatial Handling

Coordinates MUST use the `IAU_2015:49900` sphere (R = 3,396,190 m), planetocentric latitude and east-positive longitude, with one byte-identical working projection string in pipeline and UI. Mars coordinates MUST NOT pass through EPSG:3857/WGS84 code paths or Earth-radius helpers. Mars24 inputs MUST convert to west longitude. (02 §C.1, §C.4)

### V. Honest Failure and Explicit Uncertainty

Constraint violations, missing data and infeasible routes MUST be shown, never hidden: no misleading totals when a leg fails, `unknown` instead of silence when a layer is missing, and the prototype disclaimer in the app and video. Defaults are labelled assumptions, not flight rules. (01 §B "Hazards are not hidden", FR-05, F.1; 02 §E.2 PARTIAL rule; 04 §A; 05 §E.6)

### VI. Mission-Critical Clarity

In OPS and HUD views, colour MUST mean status only; every status MUST combine colour, shape, word and a fixed position; critical actions MUST be reachable in ≤ 2 taps plus a confirm, and stale values MUST show their age. (04 §A.3, §D.2–D.5; 01 FR-32, FR-33)

## Additional Constraints

- Code is Apache-2.0; data and images keep their original credits (02 NFR-07).
- No under-18 likeness in videos or images (06 TASK-17).
- Downloaded datasets and large binaries never enter git (05 §B; CLAUDE.md §2).
- Phase gate: Track P recorded 2026-11-04 — application code may be written before the event (CLAUDE.md §3, docs/ops/rules.md).

## Development Workflow

- Each spec owns one area (header **Owner** row): 01 scope and acceptance, 02 behaviour and NFRs, 03 screens and flows, 04 visuals, 05 data structures, 06 order and cuts. Change the owner first; other docs link to it.
- Traceability ids (FR-, NFR-, SCR-, TASK-, D-, U-, A-) stay stable and appear in commits and PRs.
- Labels Confirmed / Assumed / Proposed / Unresolved follow the legend in 01; a value changes label only with evidence.

## Governance

This constitution summarises `CLAUDE.md` §2–§3 and the cited spec sections; where they differ, update both in the same change. Amendments go through a PR that states the reason and bumps the version (MAJOR: principle removed or redefined; MINOR: principle added; PATCH: wording).

**Version**: 1.1.0 | **Ratified**: 2026-11-02 | **Last Amended**: 2026-11-04 (v2 surface ops: principle I widened to the habitat LAN, II adds event-log determinism, III adds two provenance classes, VI added)
