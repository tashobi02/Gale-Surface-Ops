# ADR-009 — Surface-ops reframe and the sol 4190 storm replay (D-10)

| | |
| --- | --- |
| **Owner** | Product — owning spec: [01 §E.1 Killer demo](../specs/01_Product_Requirements_Document.md#e1-killer-demo--storm-at-sol-4190-target-90-s-of-the-240-s-video) |
| **Date** | 2026-11-04 |
| **Status** | Proposed by Sadman Shaharier Mahim (product & systems lead), 2026-11-04 |
| **Related** | [01 §A.4 Exploration Zone framing](../specs/01_Product_Requirements_Document.md#a4-exploration-zone-framing-decided-2026-11-04) · [02 §D.13 Space-weather model](../specs/02_Technical_Requirements_Document.md#d13-space-weather-event-model-fr-37-fr-38) · [ADR-001 Site](ADR-001-site-selection.md) · [Docs index](../README.md#major-proposed-decisions) |

## Context

The v1 planner covers only the time before an EVA, while the challenge asks for a tool an astronaut could use *during* a surface mission with "updates on current conditions". The organizer build guide's blueprint for this challenge is a traverse planner, so most teams will build one; it also warns that one convincing demo beats five half-done features.

## Decision

- Keep the site (Gale, Mount Sharp) and present it as an **Exploration Zone** with science, resource and engineering stops.
- Extend the product into a surface operations system (planner, Hab Core, EVA tablet/HUD, ops console) in tiers T0–T2.
- Build the demo around one moment: a replay of the real **20 May 2024 (sol 4190)** solar particle event at Gale (RAD: about 8,100 µGy total), with DONKI records, SPICE-computed Earth light time and relay passes, a local radiation trigger, and a pressurized-rover rendezvous.
- Label real history as `replayed` and engine output as `simulated`; never call anything live.

## Alternative / trigger

If the RAD time series for sol 4190 is not archived (U-15), digitise NASA's published figure or scale a stated profile to the published total, and say so on screen.
