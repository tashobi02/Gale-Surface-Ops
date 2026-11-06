/**
 * Shared on-screen map controls (docs/specs/01 FR-32; 04 §E.5; mockup handoff G-42, G-43, DV-14).
 * Buttons, not gestures: each ≥ 56 px on EVA and labelled with a word (04 §A.3 #9). The full-screen
 * EVA map shows +, −, FIT, FOLLOW, LAYERS and CLOSE; ops and planner maps show + / − / FIT (drag
 * and wheel are extras). Implemented by TASK-07 (planner, ops) and TASK-24 (EVA).
 */
import type { ReactElement } from "react";

/** Which button set to show. */
export type MapControlsVariant = "eva-full" | "ops" | "planner";

export interface MapControlsProps {
  variant: MapControlsVariant;
  /** +1 = zoom in, −1 = zoom out. */
  onZoom: (direction: 1 | -1) => void;
  /** Optional button pan; drag stays an extra. */
  onPan?: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void;
  /** FOLLOW keeps the map centred on the crew member (EVA only). */
  follow: boolean;
  onFollow?: (follow: boolean) => void;
  onFit: () => void;
  /** LAYERS panel open (EVA only). */
  layersOpen: boolean;
  onLayers?: (open: boolean) => void;
  /** CLOSE returns to the normal SCR-12 layout (EVA full-screen only). */
  onClose?: () => void;
}

/** Labelled map buttons. TASK-07, TASK-24. */
export function MapControls(props: MapControlsProps): ReactElement {
  throw new Error("TODO(TASK-24): not implemented");
}
