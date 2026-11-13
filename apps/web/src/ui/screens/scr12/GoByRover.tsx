/**
 * GoByRover: the "GO BY ROVER" control on the SCR-12 next-stop card (QoL Q3, docs/plan/qol/README.md).
 * Proposed 2026-11-13, decided by Sadman Shaharier Mahim; decisions QD-008 to QD-013 in docs/plan/qol/decisions.md.
 *
 * - Enabled only when a pressurized rover is available: PARKED, this crew member walking, at a stop or holding, and a
 *   next stop to go to. A utility rover never counts (it cannot carry crew).
 * - Sends RIDE_VEHICLE `{crew_id, vehicle_id, to_stop_id}`; the Hab Core's refusal reason is shown, not swallowed (04 §D.5).
 * - Shows the ride ETA from the snapshot (the rover's `eta_s` while this crew member is RIDING; `simulated`) or "—".
 * - Neutral chrome, a 56 px target, no status colour (04 §A.3).
 */
import type { CSSProperties, ReactElement } from "react";
import type { CrewId, Snapshot } from "@marswalk/protocol";
import { UNAVAILABLE, isFiniteNumber, provAttrs, unavailableOf } from "../../components/provenance";

export interface RideView {
  /** A pressurized rover is available and there is a stop to ride to. */
  readonly available: boolean;
  /** This crew member is aboard. */
  readonly riding: boolean;
  readonly vehicleId: string | null;
  readonly stopId: string | null;
  /** Seconds left of the ride from the snapshot, null when this crew member is not riding. */
  readonly etaS: number | null;
}

const NONE: RideView = { available: false, riding: false, vehicleId: null, stopId: null, etaS: null };

/** Activities from which a ride can start (HOLDING is the Q2 hold; a string compare keeps this file independent of Q2). */
const CAN_BOARD: readonly string[] = ["WALKING", "AT_STOP", "HOLDING"];

/** The ride state of one crew member, from the snapshot only. The next stop is `stops[stop_index]`, as the NEXT card has it. */
export function selectRide(snapshot: Snapshot | null, crewId: CrewId): RideView {
  if (!snapshot) return NONE;
  const crew = snapshot.crew?.find((c) => c.crew_id === crewId);
  const rover = (snapshot.vehicles ?? []).find((v) => v.kind === "pressurized_rover");
  if (!crew) return NONE;
  if (crew.activity === "RIDING") {
    const carrying = rover?.task?.kind === "RIDE" && (rover.task.crew_ids ?? []).includes(crewId);
    return { ...NONE, riding: true, vehicleId: rover?.vehicle_id ?? null, etaS: carrying && isFiniteNumber(rover?.eta_s) ? rover.eta_s : null };
  }
  const stops = (snapshot.plan?.waypoints ?? []).filter((w) => w.role === "stop");
  const next = stops[crew.stop_index ?? 0];
  if (!rover || !next || rover.state !== "PARKED" || !CAN_BOARD.includes(crew.activity)) return NONE;
  return { available: true, riding: false, vehicleId: rover.vehicle_id, stopId: next.id, etaS: null };
}

const buttonStyle: CSSProperties = {
  minHeight: "var(--target-eva, 56px)",
  minWidth: "56px",
  padding: "4px 12px",
  fontSize: "16px",
  fontWeight: 600,
  lineHeight: 1.1,
  cursor: "pointer",
  textTransform: "uppercase",
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};

export interface GoByRoverProps {
  ride: RideView;
  onGo: (ride: { vehicleId: string; stopId: string }) => void;
}

function fmtRideEta(etaS: number | null): string {
  if (etaS === null) return UNAVAILABLE;
  const minutes = etaS / 60;
  return minutes < 1 ? "<1 min" : `${Math.round(minutes)} min`;
}

/**
 * One button, two short lines (the word, then the ride ETA), so it sits in the NEXT card's header row beside TASKS and adds
 * no height to the card (a taller card scrolls on the phone-landscape tablet, which axe flags). The Hab Core's refusal reason
 * is shown by the caller below the card's figures.
 */
export function GoByRover({ ride, onGo }: GoByRoverProps): ReactElement {
  const sourced = ride.etaS === null ? unavailableOf("simulated", "ride.eta_s") : { prov: "simulated" as const, src: "snapshot:vehicles.eta_s" };
  return (
    <button
      type="button"
      className="btn sm"
      data-slot="go-by-rover"
      data-action="go-by-rover"
      style={buttonStyle}
      disabled={!ride.available}
      aria-label="Go to the next stop by rover"
      onClick={() => {
        if (ride.available && ride.vehicleId && ride.stopId) onGo({ vehicleId: ride.vehicleId, stopId: ride.stopId });
      }}
    >
      <span>GO BY ROVER</span>
      <span data-slot="ride-eta" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "12px", fontWeight: 400 }}>
        RIDE <span {...provAttrs(sourced)}>{fmtRideEta(ride.etaS)}</span>
      </span>
    </button>
  );
}
