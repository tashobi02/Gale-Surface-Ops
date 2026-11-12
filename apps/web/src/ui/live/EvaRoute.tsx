/**
 * `#/eva/:crew` — SCR-12 on its route, with the HUD button and the SCR-14 options sheet (docs/specs/03 SCR-12, SCR-14;
 * 01 FR-32, FR-44; T24.04, T24.05, T07.03). The screens read the tab's session through the hooks: no client is passed.
 *
 * A new warning opens SCR-14; the full-screen map is delivered in package 18.
 */
import { useEffect, useState, type ReactElement } from "react";
import type { CrewId } from "@marswalk/protocol";
import { useSnapshot } from "../../state/habSession";
import { RoverTask } from "../screens/scr15RoverTask";
import { routeHash } from "../router";
import { EvaTablet } from "../screens/scr12EvaTablet";
import { Options } from "../screens/scr14Options";

export function EvaRoute({ crewId }: { crewId: CrewId }): ReactElement {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [roverOpen, setRoverOpen] = useState(false);
  const snapshot = useSnapshot();
  const warningId = snapshot?.alerts.find((alert) => alert.level === "warning" && alert.acked_seq === null && alert.cleared_seq === null && (alert.subjects.length === 0 || alert.subjects.includes(crewId)))?.alert_id;
  useEffect(() => { if (warningId) setOptionsOpen(true); }, [warningId]);
  const rovers = snapshot?.vehicles.filter((vehicle) => vehicle.kind === "utility_rover") ?? [];
  return (
    <>
      <EvaTablet
        crewId={crewId}
        optionsOpen={optionsOpen}
        onOpenRoverTasking={() => setRoverOpen(true)}
        onOpenHud={() => {
          globalThis.location.hash = routeHash("hud", crewId);
        }}
        onOpenOptions={() => setOptionsOpen(true)}
      />
      {roverOpen && <div data-screen="SCR-15" style={{ position: "fixed", inset: 0, zIndex: 50, overflow: "auto" }}><RoverTask vehicleId={rovers.length === 1 ? rovers[0]?.vehicle_id : undefined} onClose={() => setRoverOpen(false)} /></div>}
      {optionsOpen && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, maxHeight: "80vh", overflow: "auto" }}>
          <Options variant="eva" crewId={crewId} onClose={() => setOptionsOpen(false)} />
        </div>
      )}
    </>
  );
}
