/**
 * C17 — EVA view model selectors (docs/specs/03 SCR-12, SCR-13; 04 §E.5, §E.6; FR-32, FR-33, NFR-05).
 * Selectors from the Hab Core client store Snapshot to what the EVA tablet and HUD display.
 * Every displayed mission value carries {v, unit, prov, src} to satisfy FR-15 / data-provenance.
 *
 * Rules:
 * - Zero invented numbers: no default speeds, no hard-coded bars (3/0), no fake stop coordinates,
 *   no made-up 8-hour life support formulas (frac * 480).
 * - Honest provenance: simulated telemetry is labelled "simulated" (never "measured");
 *   provenance is taken directly from snapshot.provenance.
 * - Status comes from server alerts (HAVEN_TIME_EXCEEDED, RADIATION_ALERT, CONSUMABLES_LOW),
 *   never from client-side threshold math.
 * - Missing or unavailable values render "—" per 04 no-data rule with TODO(decision) recording.
 *
 * Contract version: C17 v1 (frozen T24.01, 2026-11-07).
 * Implementation: T24.03 (Ridita Alam).
 */
import type {
  CrewId,
  Provenance,
  Snapshot,
} from "@marswalk/protocol";
import { UNAVAILABLE, isFiniteNumber } from "../components/provenance";

/** A displayed value with full data provenance (04 §A.3 #8, FR-15). src is required (contract from #92). */
export interface ProvenanceValue<T> {
  readonly v: T;
  readonly unit: string;
  /** The field's provenance class; null only when a missing value's class is not known (see provenance.ts). */
  readonly prov: Provenance | null;
  readonly src: string;
  /** True when the Hab Core has not supplied the value: it reads "—" and `src` is `unavailable:<path>`. */
  readonly unavailable?: boolean;
}

/** HAVEN telemetry card on SCR-12 / SCR-13 (04 §E.5, §E.6). */
export interface EvaHavenView {
  readonly minutes: ProvenanceValue<number | string>;
  readonly kind: "hab" | "vehicle" | "refuge" | null;
  readonly targetId?: string;
  readonly status: EvaCardStatus;
}

/** O₂ telemetry card on SCR-12 / SCR-13 (04 §E.5, §E.6). */
export interface EvaO2View {
  readonly percent: ProvenanceValue<number | string>;
  readonly timeLeftMinutes: ProvenanceValue<number | string>;
  readonly status: EvaCardStatus;
}

/** Next stop card on SCR-12 (04 §E.5). */
export interface EvaNextStopView {
  readonly stopId: string;
  readonly stopName: string;
  readonly bearingDeg: ProvenanceValue<number | string>;
  readonly distanceM: ProvenanceValue<number | string>;
  readonly etaMinutes: ProvenanceValue<number | string>;
  readonly taskCount: { readonly done: number; readonly total: number };
}

/** Active alert slot on SCR-12 / SCR-13 (04 §D.2, §E.5, §E.6). */
export interface EvaAlertSlotView {
  readonly alertId: string;
  readonly code: string;
  readonly level: "caution" | "warning" | "advisory";
  readonly message: string;
  readonly acknowledged: boolean;
}

/** Metadata strip on SCR-12 (04 §C.3, §E.5). */
export interface EvaMetadataStripView {
  readonly evaTimeSeconds: ProvenanceValue<number | string>;
  readonly doseUgy: ProvenanceValue<number | string>;
  readonly link: EvaLinkView;
}

/**
 * Link state of one crew member. `linked` and `stale` are null when the Hab Core has not reported
 * the crew member (unknown, never assumed linked). `ageSeconds` is null until the Hab Core supplies a
 * telemetry age: the client does not invent one (TODO(decision): see docs/tasks/status.md T24.03 and T24.07).
 */
export interface EvaLinkView {
  readonly linked: boolean | null;
  readonly bars: number;
  readonly ageSeconds: number | null;
  readonly stale: boolean | null;
}

/** Status of a telemetry card; "unknown" when there is no telemetry to judge (04 §C.1, never a nominal default). */
export type EvaCardStatus = "nominal" | "caution" | "warning" | "unknown";

/** SCR-12 complete view model. */
export interface EvaViewModel {
  readonly crewId: CrewId;
  readonly haven: EvaHavenView;
  readonly o2: EvaO2View;
  readonly nextStop: EvaNextStopView | null;
  readonly alertSlot: EvaAlertSlotView | null;
  readonly metadata: EvaMetadataStripView;
}

/** SCR-13 HUD complete view model (at most 5 values, 04 §E.6). */
export interface HudViewModel {
  readonly crewId: CrewId;
  readonly alertSlot: EvaAlertSlotView | null;
  readonly haven: EvaHavenView;
  readonly targetBearingDistance: {
    readonly bearingDeg: ProvenanceValue<number | string>;
    readonly distanceM: ProvenanceValue<number | string>;
    readonly targetLabel: string;
  } | null;
  readonly o2: EvaO2View;
  readonly link: EvaLinkView;
}

const VALID_HAVEN_KINDS = ["hab", "vehicle", "refuge"] as const;

/**
 * A value the Hab Core has not supplied (04 §D.1): "—", flagged unavailable, with an `unavailable:` source and the
 * field's own provenance class where 05 gives one. Missing data is never labelled `assumed` (01: a parameter we chose).
 */
function unavailable(path: string, prov: Provenance | null): ProvenanceValue<string> {
  return { v: UNAVAILABLE, unit: "", prov, src: `unavailable:${path}`, unavailable: true };
}

/** Visible label for where the HAVEN card leads; never a default vehicle id. */
export function havenTargetLabel(haven: Pick<EvaHavenView, "kind" | "targetId">): string {
  if (haven.kind === "vehicle") return haven.targetId ? `via ${haven.targetId}` : `via ${UNAVAILABLE}`;
  if (haven.kind === "hab") return "to HAB";
  if (haven.kind === "refuge") return "to REFUGE";
  return UNAVAILABLE;
}

// ---------------------------------------------------------------------------
// Selectors (T24.03)
// ---------------------------------------------------------------------------

export function selectHaven(snapshot: Snapshot | null, crewId: CrewId): EvaHavenView {
  const crew = snapshot?.crew?.find((c) => c.crew_id === crewId);
  const rawMinutes: unknown = crew?.haven?.minutes;
  const hasMinutes = isFiniteNumber(rawMinutes);

  // Validate kind safely without unvalidated typecast; unknown stays unknown (never defaulted to "hab")
  const rawKind = crew?.haven?.kind;
  const kind: "hab" | "vehicle" | "refuge" | null =
    rawKind && (VALID_HAVEN_KINDS as readonly string[]).includes(rawKind)
      ? (rawKind as "hab" | "vehicle" | "refuge")
      : null;

  // Status comes strictly from server alerts (HAVEN_TIME_EXCEEDED, RADIATION_ALERT), NOT client thresholds
  const crewAlerts = (snapshot?.alerts ?? []).filter(
    (a) => !a.subjects || a.subjects.length === 0 || a.subjects.includes(crewId),
  );
  const escalationAlert = crewAlerts.find(
    (a) => a.code === "RADIATION_ALERT" || a.code === "HAVEN_TIME_EXCEEDED",
  );

  // No telemetry and no server alert: the status is unknown, not nominal.
  let status: EvaCardStatus = hasMinutes ? "nominal" : "unknown";
  if (escalationAlert) {
    status = escalationAlert.level === "warning" ? "warning" : "caution";
  }

  // Derive target vehicle id dynamically from snapshot vehicles, never hardcoded "PR1"
  let targetId: string | undefined;
  if (kind === "vehicle" && snapshot?.vehicles) {
    const rover = snapshot.vehicles.find(
      (v) => v.kind === "pressurized_rover" || v.state === "EN_ROUTE" || v.state === "DISPATCHED",
    );
    targetId = rover?.vehicle_id;
  }

  const minutes: ProvenanceValue<number | string> = hasMinutes
    ? {
        v: rawMinutes,
        unit: "min",
        prov: (snapshot?.provenance?.["crew.haven.minutes"] as Provenance) ?? "modelled",
        src: "snapshot:crew.haven.minutes",
      }
    : unavailable("crew.haven.minutes", "modelled");

  return { minutes, kind, targetId, status };
}

export function selectO2(snapshot: Snapshot | null, crewId: CrewId): EvaO2View {
  const crew = snapshot?.crew?.find((c) => c.crew_id === crewId);
  const frac: unknown = crew?.o2_frac;
  const hasFrac = isFiniteNumber(frac);

  // Status comes strictly from server alert CONSUMABLES_LOW, never client thresholds (e.g. 20/35%)
  const crewAlerts = (snapshot?.alerts ?? []).filter(
    (a) => !a.subjects || a.subjects.length === 0 || a.subjects.includes(crewId),
  );
  const o2Alert = crewAlerts.find((a) => a.code === "CONSUMABLES_LOW");
  let status: EvaCardStatus = hasFrac ? "nominal" : "unknown";
  if (o2Alert) {
    status = o2Alert.level === "warning" ? "warning" : "caution";
  }

  // Time left: read from alert if available, otherwise "—". TODO(decision): Sadman to supply o2_time_left_min on crew.
  const rawTimeLeft: unknown = (o2Alert?.data as Record<string, unknown> | undefined)?.o2_remaining_min;
  const alertTimeLeft = isFiniteNumber(rawTimeLeft) ? rawTimeLeft : undefined;
  const timeLeftMinutes = alertTimeLeft !== undefined ? alertTimeLeft : UNAVAILABLE;
  const timeLeftProv: Provenance | null = alertTimeLeft !== undefined ? "derived" : null;
  const timeLeftSrc = alertTimeLeft !== undefined ? "hab-core:alert.o2_remaining_min" : "unavailable:crew.o2_time_left_min";

  // Provenance: simulated, never "measured"
  const percent: ProvenanceValue<number | string> = hasFrac
    ? {
        v: Math.round(frac * 100),
        unit: "%",
        prov: (snapshot?.provenance?.["crew.o2_frac"] as Provenance) ?? "simulated",
        src: "snapshot:crew.o2_frac",
      }
    : unavailable("crew.o2_frac", "simulated");

  return {
    percent,
    timeLeftMinutes: {
      v: timeLeftMinutes,
      unit: typeof timeLeftMinutes === "number" ? "min" : "",
      prov: timeLeftProv,
      src: timeLeftSrc,
      ...(alertTimeLeft === undefined ? { unavailable: true } : {}),
    },
    status,
  };
}

export function selectAlertSlot(snapshot: Snapshot | null, crewId: CrewId): EvaAlertSlotView | null {
  if (!snapshot) return null;

  const alerts = (snapshot.alerts ?? []).filter(
    (a) => !a.subjects || a.subjects.length === 0 || a.subjects.includes(crewId),
  );

  if (alerts.length > 0) {
    const levelRank: Record<string, number> = { warning: 3, caution: 2, advisory: 1 };
    const sorted = [...alerts].sort((a, b) => {
      const diff = (levelRank[b.level] || 0) - (levelRank[a.level] || 0);
      if (diff !== 0) return diff;
      const aAck = a.acked_seq !== null ? 1 : 0;
      const bAck = b.acked_seq !== null ? 1 : 0;
      return aAck - bAck;
    });
    const top = sorted[0];
    return {
      alertId: top.alert_id,
      code: top.code,
      level: top.level,
      message: top.message,
      acknowledged: top.acked_seq !== null,
    };
  }

  if (snapshot.options && snapshot.options.length > 0) {
    const opt = snapshot.options[0];
    return {
      alertId: opt.alert_id || "opt-alert",
      code: "CONTINGENCY_OPTIONS",
      level: "warning",
      message: "Contingency options available — review and confirm",
      acknowledged: false,
    };
  }

  return null;
}

/**
 * Next stop card. Bearing and distance are NOT computed here: the UI holds no science (TASK-24, AGENTS
 * rule 2), and no authoritative navigation value reaches the snapshot yet, so both stay unavailable ("—").
 * TODO(decision): reconcile current versus next stop selection with one-based engine stop_index, crew activity and
 * revised plans; obtain authoritative navigation values from Hab Core/compute.
 */
export function selectNextStop(snapshot: Snapshot | null, crewId: CrewId): EvaNextStopView | null {
  if (!snapshot) return null;
  const crew = snapshot.crew?.find((c) => c.crew_id === crewId);

  const waypoints = snapshot.plan?.waypoints ?? [];
  // Tasks this crew member may see: their own or "either crew" (crew_id null). Never another crew's.
  const eligibleTasks = (snapshot.tasks ?? []).filter((t) => t.crew_id === null || t.crew_id === crewId);
  let stopId: string | null = null;
  let stopName = "";
  // TODO(decision): Sadman to supply stop ETA in plan or snapshot when no leg gives one.
  let etaMin: number | string = UNAVAILABLE;

  if (waypoints.length > 0) {
    const stops = waypoints.filter((w) => w.role === "stop");
    const stopIdx = crew?.stop_index ?? 0;
    const nextWp = stops[stopIdx] ?? stops[0] ?? waypoints[0];
    if (nextWp) {
      stopId = nextWp.id;
      stopName = nextWp.label || `Stop ${stopId.replace(/^wp-/, "")}`;

      const legs = snapshot.plan?.result?.legs ?? [];
      const leg = legs.find((l) => l.to === nextWp.id);
      if (leg && "walk_time_min" in leg && isFiniteNumber(leg.walk_time_min)) {
        etaMin = Math.round(leg.walk_time_min);
      }
    }
  } else if (eligibleTasks.length > 0) {
    const task = eligibleTasks[0];
    stopId = task.stop_id;
    stopName = `Stop ${stopId.replace(/^wp-/, "")}`;
  }

  if (!stopId) {
    return null;
  }

  // TODO(decision): authoritative navigation (bearing, distance) from Hab Core/compute.

  const tasks = eligibleTasks.filter((t) => t.stop_id === stopId);
  const done = tasks.filter((t) => t.state === "DONE").length;

  return {
    stopId,
    stopName,
    bearingDeg: { v: UNAVAILABLE, unit: "", prov: null, src: "unavailable:next_stop.bearing_deg", unavailable: true },
    distanceM: { v: UNAVAILABLE, unit: "", prov: null, src: "unavailable:next_stop.distance_m", unavailable: true },
    etaMinutes: {
      v: etaMin,
      unit: typeof etaMin === "number" ? "min" : "",
      prov: typeof etaMin === "number" ? "derived" : null,
      src: typeof etaMin === "number" ? "plan.legs.walk_time_min" : "unavailable:next_stop.eta_min",
      ...(typeof etaMin === "number" ? {} : { unavailable: true }),
    },
    taskCount: {
      done,
      total: tasks.length,
    },
  };
}

export function selectMetadataStrip(snapshot: Snapshot | null, crewId: CrewId): EvaMetadataStripView {
  const crew = snapshot?.crew?.find((c) => c.crew_id === crewId);
  // Unknown (null) when the crew member is not in the snapshot: never assumed linked.
  const linked: boolean | null = typeof crew?.linked === "boolean" ? crew.linked : null;
  const stale: boolean | null = typeof crew?.stale === "boolean" ? crew.stale : linked === null ? null : !linked;

  // Provenance: simulated, NEVER "measured"
  const evaProv = (snapshot?.provenance?.["crew.eva_elapsed_s"] as Provenance) ?? "simulated";
  const doseProv = (snapshot?.provenance?.["crew.dose_event_ugy"] as Provenance) ?? "simulated";

  // Bars: 0 when unlinked or unknown, 1-3 when linked based on hop length
  let bars = 0;
  if (linked) {
    const hops = crew?.link_path?.length ?? 1;
    bars = Math.min(3, Math.max(1, 4 - hops));
  }

  const eva: unknown = crew?.eva_elapsed_s;
  const dose: unknown = crew?.dose_event_ugy;

  return {
    evaTimeSeconds: isFiniteNumber(eva)
      ? { v: eva, unit: "s", prov: evaProv, src: "snapshot:crew.eva_elapsed_s" }
      : unavailable("crew.eva_elapsed_s", "simulated"),
    doseUgy: isFiniteNumber(dose)
      ? { v: dose, unit: "µGy", prov: doseProv, src: "snapshot:crew.dose_event_ugy" }
      : unavailable("crew.dose_event_ugy", "simulated"),
    link: {
      linked,
      bars,
      // No telemetry age reaches the snapshot: unavailable, not a placeholder.
      // TODO(decision): Sadman to supply telemetry ageSeconds in snapshot.crew or derive from client linkLost().
      ageSeconds: null,
      stale,
    },
  };
}

export function selectEvaViewModel(snapshot: Snapshot | null, crewId: CrewId): EvaViewModel {
  return {
    crewId,
    haven: selectHaven(snapshot, crewId),
    o2: selectO2(snapshot, crewId),
    nextStop: selectNextStop(snapshot, crewId),
    alertSlot: selectAlertSlot(snapshot, crewId),
    metadata: selectMetadataStrip(snapshot, crewId),
  };
}

export function selectHudViewModel(snapshot: Snapshot | null, crewId: CrewId): HudViewModel {
  const haven = selectHaven(snapshot, crewId);
  const o2 = selectO2(snapshot, crewId);
  const alertSlot = selectAlertSlot(snapshot, crewId);
  const meta = selectMetadataStrip(snapshot, crewId);
  const nextStop = selectNextStop(snapshot, crewId);

  const targetBearingDistance =
    nextStop && typeof nextStop.bearingDeg.v === "number" && typeof nextStop.distanceM.v === "number"
      ? {
          bearingDeg: nextStop.bearingDeg,
          distanceM: nextStop.distanceM,
          targetLabel: nextStop.stopName,
        }
      : null;

  return {
    crewId,
    alertSlot,
    haven,
    targetBearingDistance,
    o2,
    link: meta.link,
  };
}
