/**
 * Debug overlay for inspecting map extent, coordinates and sim state (NFR-11). Shown with `?debug=1`.
 * Stub for T07.13 (React component, C10 v2).
 */
import type { ReactElement } from "react";
import type { AppContext } from "./context";

export interface DebugOverlayProps {
  ctx: AppContext;
}

export function DebugOverlay(props: DebugOverlayProps): ReactElement {
  throw new Error("TODO(T07.13): DebugOverlay not implemented");
}
