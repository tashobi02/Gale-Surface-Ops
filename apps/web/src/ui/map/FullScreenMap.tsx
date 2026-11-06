/**
 * Full-screen EVA map for SCR-12 (docs/specs/01 FR-32; 04 §E.5; mockup handoff DV-13, G-42, G-48).
 * Opens over the body area from the mini-map or FULL. Fixed geography holds: the alert slot, the
 * metadata strip and the action row do not move and HAVEN and O₂ stay visible (portrait: in their
 * row; landscape: stacked at the left, map ≥ 80 % of the width, U-60). A warning closes it. At most
 * two scientific layers; a third turns the oldest off and says so. Projected metres only, never
 * EPSG:3857 or `ol/sphere` (02 §C.1). Implemented by TASK-24.
 */
import type { ReactElement } from "react";
import type { Crew } from "@marswalk/protocol";

/** Scientific overlays offered on the full-screen map (04 §E.5; final set U-57). */
export type FullScreenMapLayer = "slope" | "thermal_inertia" | "comm_shadow" | "haven_bands";

/** "At most two scientific overlays at once" (04 §E.5). */
export const MAX_SCIENCE_LAYERS = 2;

export interface FullScreenMapProps {
  crew: Crew[];
  /** Map view in working-projection metres. */
  view: { center_x_m: number; center_y_m: number; resolution_m_per_px: number };
  /** Oldest first; length ≤ MAX_SCIENCE_LAYERS. */
  layers: FullScreenMapLayer[];
  orientation: "portrait" | "landscape";
  onClose: () => void;
}

/** SCR-12 full-screen map. TASK-24. */
export function FullScreenMap(props: FullScreenMapProps): ReactElement {
  throw new Error("TODO(TASK-24): not implemented");
}
