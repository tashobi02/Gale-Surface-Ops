/**
 * `#/eva/:crew` — SCR-12 on its route, with the HUD button and the SCR-14 options sheet (docs/specs/03 SCR-12, SCR-14;
 * 01 FR-32, FR-44; T24.04, T24.05, T07.03). The screens read the tab's session through the hooks: no client is passed.
 *
 * Not wired (the tablet's buttons for them do nothing yet): SCR-15 rover tasking (screen not built, T29) and the
 * full-screen map (needs the map of T07.06, which another branch is building).
 * TODO(decision): the options sheet opens only from the alert bar's OPTIONS button; 03 SCR-14 also says "automatically on
 * a warning", which needs a decision on interrupting a crew member who is mid-task (U-59).
 */
import { useState, type ReactElement } from "react";
import type { CrewId } from "@marswalk/protocol";
import { routeHash } from "../router";
import { EvaTablet } from "../screens/scr12EvaTablet";
import { Options } from "../screens/scr14Options";

export function EvaRoute({ crewId }: { crewId: CrewId }): ReactElement {
  const [optionsOpen, setOptionsOpen] = useState(false);
  return (
    <>
      <EvaTablet
        crewId={crewId}
        onOpenHud={() => {
          globalThis.location.hash = routeHash("hud", crewId);
        }}
        onOpenOptions={() => setOptionsOpen(true)}
      />
      {optionsOpen && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, maxHeight: "80vh", overflow: "auto" }}>
          <Options variant="eva" crewId={crewId} onClose={() => setOptionsOpen(false)} />
        </div>
      )}
    </>
  );
}
