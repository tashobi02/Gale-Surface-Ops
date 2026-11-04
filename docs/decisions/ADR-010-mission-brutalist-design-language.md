# ADR-010 — Mission-brutalist design language (D-13)

| | |
| --- | --- |
| **Owner** | Design — owning spec: [04 §A.2 Visual character](../specs/04_Design_Brief.md#a2-visual-character-mission-brutalism) |
| **Date** | 2026-11-04 |
| **Status** | Proposed (direction from the team, 2026-11-04) |
| **Related** | [04 §A.3 Mission-critical principles](../specs/04_Design_Brief.md#a3-mission-critical-principles-non-negotiable) · [04 §B Design language](../specs/04_Design_Brief.md#b-design-language) · [04 §C.1 Colour tokens](../specs/04_Design_Brief.md#c1-colour-tokens) · [Docs index](../README.md#major-proposed-decisions) |

## Context

The team asked for a space sci-fi brutalist look drawing on a reference board (orange slabs, chamfers, mono microcopy), Anduril, Anthropic, Colossal Biosciences and Starfield, while staying usable in mission-critical moments. On 2026-11-04 these sources were researched along with the NASA Graphics Standards Manual (1975), the Guidelines for Brutalist Web Design and an accessibility review of Starfield's in-game screens; findings and the twelve adopted patterns are in [04 §B.1–B.4](../specs/04_Design_Brief.md#b3-patterns-adopted-from-the-research).

## Decision

"Brutalism is for chrome, never for data." Four modes: **BRIEF** (light editorial, signal orange) for judge-facing pages; **OPS** (dark instrument) for planner, ops and EVA; **HUD** (black, ≥ 7 : 1); **PRINT**. Status colours mean status only; brand orange never appears in OPS/HUD. Every status has colour, shape, word and fixed position. Critical actions use hold-to-confirm. Fonts: Chakra Petch at weight 500 (display, never bold), Inter (UI), IBM Plex Mono (all numbers, catalogue codes), Source Serif 4 (long-form reading). Catalogue codes and specimen cards (from Colossal) use real ids only. Starfield's documented UI failures (colour-only focus, hidden scroll, decoration that mimics controls) are explicit anti-patterns.

## Consequences

Tokens live in `apps/web/src/ui/styles/tokens.css` keyed by `<html data-mode>`; v1 planner token names map to v2 (04 Appendix A). Font and icon licences must be verified (U-27).

## Alternative / trigger

If time runs short, keep the v1 dark planner look and apply v2 only to EVA, HUD and the alert bar (06 §D.4 cut 3).
