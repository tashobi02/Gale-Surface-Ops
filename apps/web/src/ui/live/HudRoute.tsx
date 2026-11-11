/**
 * `#/hud/:crew` — SCR-13 on its route (docs/specs/03 SCR-13; 04 §E.6; 01 FR-33; T24.08, T07.03).
 *
 * The HUD stays read-only: no buttons. Exit is a tap-and-hold anywhere for 2 s back to the tablet of the same crew member
 * (03 SCR-13 "Actions"); Escape does the same for a keyboard. The screen reads the tab's session through the hooks.
 */
import { useEffect, useRef, type ReactElement } from "react";
import type { CrewId } from "@marswalk/protocol";
import { routeHash } from "../router";
import { Hud } from "../screens/scr13Hud";

/** 03 SCR-13: "tap-and-hold anywhere (2 s)". */
export const HUD_EXIT_HOLD_MS = 2000;

export function HudRoute({ crewId }: { crewId: CrewId }): ReactElement {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const exit = (): void => {
    globalThis.location.hash = routeHash("eva", crewId);
  };
  useEffect(() => cancel, []);
  return (
    // The wrapper only listens: the HUD has no controls. tabIndex lets Escape reach it from the keyboard.
    <div
      data-slot="hud-route"
      tabIndex={0}
      style={{ minHeight: "100vh", outline: "none" }}
      onPointerDown={() => {
        cancel();
        timer.current = setTimeout(exit, HUD_EXIT_HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") exit();
      }}
    >
      <Hud crewId={crewId} />
    </div>
  );
}
