/**
 * The mandatory NASA Space Apps prototype boundary statement (01 §F.1, FR-52).
 *
 * It must appear verbatim in the app (the launchpad briefing and the post-EVA report) and in the exported
 * plan JSON. This module is the single source of truth: the launchpad, the report and the export all import
 * it, so the three copies cannot drift apart.
 *
 * The product name is the D-08 name decided in [ADR-013](../../../decisions/ADR-013-product-name.md):
 * **Gale Surface Ops** (FD-006, FD-163). The 01 §F.1 wording still carries the retired working title;
 * ADR-013 renames the product, so the boundary statement follows the name.
 */
export const PRODUCT_NAME = "Gale Surface Ops";

/** The 01 §F.1 prototype boundary statement, verbatim except for the product name (FD-490, FD-491). */
export const PROTOTYPE_DISCLAIMER =
  `${PRODUCT_NAME} is an exploratory hackathon prototype. It is not astronaut operations software. ` +
  "Crew, suit, rover and vehicle states are simulated. Solar events are real historical records replayed " +
  "on a simulated clock — not a live feed from Mars. Slope limits, speeds, consumables and shelter values " +
  "are illustrative assumptions from Earth and Apollo-era references. Radio coverage is line-of-sight only.";
