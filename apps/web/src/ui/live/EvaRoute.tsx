/**
 * `#/eva/:crew` — SCR-12 on its route, with the HUD button and the SCR-14 options sheet (docs/specs/03 SCR-12, SCR-14;
 * 01 FR-32, FR-44; T24.04, T24.05, T07.03). The screens read the tab's session through the hooks: no client is passed.
 *
 * A NEW warning that CARRIES options opens SCR-14 (FD-081). A warning with no options yet does not: the sheet would
 * cover HAVEN, O₂ and the action row to say "no options proposed yet" (04 §E.5: those never move and are never
 * covered). The crew member opens the sheet from the alert bar's OPTIONS button instead.
 *
 * The full-screen map is delivered in package 18.
 */
import { useEffect, useRef, useState, type ReactElement } from "react";
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
  // The warning that concerns this crew member and has not been acknowledged or cleared.
  const warningId = snapshot?.alerts.find(
    (alert) =>
      alert.level === "warning" &&
      alert.acked_seq === null &&
      alert.cleared_seq === null &&
      (alert.subjects.length === 0 || alert.subjects.includes(crewId)),
  )?.alert_id;
  // FD-081: the sheet opens on a NEW warning that CARRIES options. The alert id alone is not enough: the Hab Core
  // raises the warning first and the options arrive with it, so a warning without options must not cover the tablet.
  const warningHasOptions = Boolean(warningId && snapshot?.options.some((option) => option.alert_id === warningId));
  // The warning the sheet was last opened for, so the same warning does not reopen the sheet again and again.
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!warningId) {
      openedFor.current = null;
      return;
    }
    if (!warningHasOptions) return;
    if (openedFor.current === warningId) return;
    openedFor.current = warningId;
    setOptionsOpen(true);
  }, [warningId, warningHasOptions]);
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
        // The sheet is a bottom sheet over the tablet's BODY: it stops above the action row and below the telemetry
        // row, so HAVEN, O₂ and ABORT/SUMMON/TASK ROVER/HUD are never covered (04 §E.5, FD-081).
        <div
          data-slot="eva-options-sheet"
          className="scr12-eva-options-sheet"
          style={{ position: "fixed", left: 0, right: 0, zIndex: 50, overflow: "auto" }}
        >
          <Options variant="eva" crewId={crewId} onClose={() => setOptionsOpen(false)} />
        </div>
      )}
    </>
  );
}
