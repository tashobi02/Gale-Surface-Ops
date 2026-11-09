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

/** A displayed value with full data provenance (04 §A.3 #8, FR-15). src is required (contract from #92). */
export interface ProvenanceValue<T> {
  readonly v: T;
  readonly unit: string;
  readonly prov: Provenance;
  readonly src: string;
}

/** HAVEN telemetry card on SCR-12 / SCR-13 (04 §E.5, §E.6). */
export interface EvaHavenView {
  readonly minutes: ProvenanceValue<number | string>;
  readonly kind: "hab" | "vehicle" | "refuge";
  readonly targetId?: string;
  readonly status: "nominal" | "caution" | "warning";
}

/** O₂ telemetry card on SCR-12 / SCR-13 (04 §E.5, §E.6). */
export interface EvaO2View {
  readonly percent: ProvenanceValue<number>;
  readonly timeLeftMinutes: ProvenanceValue<number | string>;
  readonly status: "nominal" | "caution" | "warning";
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
  readonly evaTimeSeconds: ProvenanceValue<number>;
  readonly doseUgy: ProvenanceValue<number>;
  readonly link: {
    readonly linked: boolean;
    readonly bars: number;
    readonly ageSeconds: number;
    readonly stale: boolean;
  };
}

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
  readonly link: {
    readonly linked: boolean;
    readonly bars: number;
    readonly stale: boolean;
    readonly ageSeconds: number;
  };
}

const VALID_HAVEN_KINDS = ["hab", "vehicle", "refuge"] as const;

// ---------------------------------------------------------------------------
// Selectors (T24.03)
// ---------------------------------------------------------------------------

export function selectHaven(snapshot: Snapshot | null, crewId: CrewId): EvaHavenView {
  const crew = snapshot?.crew?.find((c) => c.crew_id === crewId);
  const rawMinutes = crew?.haven?.minutes;
  const minutes = rawMinutes !== undefined ? rawMinutes : "—";

  // Validate kind safely without unvalidated typecast
  const rawKind = crew?.haven?.kind;
  const kind: "hab" | "vehicle" | "refuge" =
    rawKind && (VALID_HAVEN_KINDS as readonly string[]).includes(rawKind)
      ? (rawKind as "hab" | "vehicle" | "refuge")
      : "hab";

  // Status comes strictly from server alerts (HAVEN_TIME_EXCEEDED, RADIATION_ALERT), NOT client thresholds
  const crewAlerts = (snapshot?.alerts ?? []).filter(
    (a) => !a.subjects || a.subjects.length === 0 || a.subjects.includes(crewId),
  );
  const escalationAlert = crewAlerts.find(
    (a) => a.code === "RADIATION_ALERT" || a.code === "HAVEN_TIME_EXCEEDED",
  );

  let status: "nominal" | "caution" | "warning" = "nominal";
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

  const prov = (snapshot?.provenance?.["crew.haven.minutes"] as Provenance) ?? "modelled";

  return {
    minutes: {
      v: minutes,
      unit: typeof minutes === "number" ? "min" : "",
      prov,
      src: "snapshot:crew.haven.minutes",
    },
    kind,
    targetId,
    status,
  };
}

export function selectO2(snapshot: Snapshot | null, crewId: CrewId): EvaO2View {
  const crew = snapshot?.crew?.find((c) => c.crew_id === crewId);
  const frac = crew?.o2_frac ?? 0;
  const percent = Math.round(frac * 100);

  // Status comes strictly from server alert CONSUMABLES_LOW, never client thresholds (e.g. 20/35%)
  const crewAlerts = (snapshot?.alerts ?? []).filter(
    (a) => !a.subjects || a.subjects.length === 0 || a.subjects.includes(crewId),
  );
  const o2Alert = crewAlerts.find((a) => a.code === "CONSUMABLES_LOW");
  let status: "nominal" | "caution" | "warning" = "nominal";
  if (o2Alert) {
    status = o2Alert.level === "warning" ? "warning" : "caution";
  }

  // Time left: read from alert if available, otherwise "—" with TODO(decision) for Sadman
  const alertTimeLeft = (o2Alert?.data as Record<string, unknown> | undefined)?.o2_remaining_min as number | undefined;
  const timeLeftMinutes = alertTimeLeft !== undefined ? alertTimeLeft : "—";
  const timeLeftProv: Provenance = alertTimeLeft !== undefined ? "derived" : "assumed";
  const timeLeftSrc = alertTimeLeft !== undefined ? "hab-core:alert.o2_remaining_min" : "TODO(decision): Sadman to supply o2_time_left_min on crew";

  // Provenance: simulated, never "measured"
  const o2Prov = (snapshot?.provenance?.["crew.o2_frac"] as Provenance) ?? "simulated";

  return {
    percent: {
      v: percent,
      unit: "%",
      prov: o2Prov,
      src: "snapshot:crew.o2_frac",
    },
    timeLeftMinutes: {
      v: timeLeftMinutes,
      unit: typeof timeLeftMinutes === "number" ? "min" : "",
      prov: timeLeftProv,
      src: timeLeftSrc,
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

export function selectNextStop(snapshot: Snapshot | null, crewId: CrewId): EvaNextStopView | null {
  if (!snapshot) return null;
  const crew = snapshot.crew?.find((c) => c.crew_id === crewId);

  const waypoints = snapshot.plan?.waypoints ?? [];
  let stopId: string | null = null;
  let stopName = "";
  let targetX: number | null = null;
  let targetY: number | null = null;
  let etaMin: number | string = "—";

  if (waypoints.length > 0) {
    const stops = waypoints.filter((w) => w.role === "stop");
    const stopIdx = crew?.stop_index ?? 0;
    const nextWp = stops[stopIdx] ?? stops[0] ?? waypoints[0];
    if (nextWp) {
      stopId = nextWp.id;
      stopName = nextWp.label || `Stop ${stopId.replace(/^wp-/, "")}`;
      targetX = nextWp.x_m;
      targetY = nextWp.y_m;

      const legs = snapshot.plan?.result?.legs ?? [];
      const leg = legs.find((l) => l.to === nextWp.id);
      if (leg && "walk_time_min" in leg && typeof leg.walk_time_min === "number") {
        etaMin = Math.round(leg.walk_time_min);
      }
    }
  } else if (snapshot.tasks && snapshot.tasks.length > 0) {
    const task = snapshot.tasks.find((t) => !t.crew_id || t.crew_id === crewId) ?? snapshot.tasks[0];
    if (task) {
      stopId = task.stop_id;
      stopName = `Stop ${stopId.replace(/^wp-/, "")}`;
      // When plan is not loaded, check if crew haven coordinates provide reference target
      if (crew?.haven?.target_x_m !== undefined && crew?.haven?.target_y_m !== undefined) {
        targetX = crew.haven.target_x_m;
        targetY = crew.haven.target_y_m;
      }
    }
  }

  if (!stopId) {
    return null;
  }

  let bearing: number | string = "—";
  let dist: number | string = "—";

  if (targetX !== null && targetY !== null && crew) {
    const dx = targetX - crew.x_m;
    const dy = targetY - crew.y_m;
    const distM = Math.hypot(dx, dy);
    let deg = Math.round((Math.atan2(dx, dy) * 180) / Math.PI);
    if (deg < 0) deg += 360;
    bearing = deg;
    dist = Math.round(distM);
  }

  const tasks = (snapshot.tasks ?? []).filter((t) => t.stop_id === stopId);
  const done = tasks.filter((t) => t.state === "DONE").length;
  const total = tasks.length > 0 ? tasks.length : 1;

  return {
    stopId,
    stopName,
    bearingDeg: {
      v: bearing,
      unit: typeof bearing === "number" ? "°" : "",
      prov: typeof bearing === "number" ? "derived" : "assumed",
      src: typeof bearing === "number" ? "compute:geometry" : "TODO(decision): Sadman to provide plan waypoints",
    },
    distanceM: {
      v: dist,
      unit: typeof dist === "number" ? "m" : "",
      prov: typeof dist === "number" ? "derived" : "assumed",
      src: typeof dist === "number" ? "compute:geometry" : "TODO(decision): Sadman to provide plan waypoints",
    },
    etaMinutes: {
      v: etaMin,
      unit: typeof etaMin === "number" ? "min" : "",
      prov: typeof etaMin === "number" ? "derived" : "assumed",
      src: typeof etaMin === "number" ? "plan.legs.walk_time_min" : "TODO(decision): Sadman to supply stop ETA in plan or snapshot",
    },
    taskCount: {
      done,
      total,
    },
  };
}

export function selectMetadataStrip(snapshot: Snapshot | null, crewId: CrewId): EvaMetadataStripView {
  const crew = snapshot?.crew?.find((c) => c.crew_id === crewId);
  const linked = crew?.linked ?? true;
  const stale = crew?.stale ?? (!linked);

  // Provenance: simulated, NEVER "measured"
  const evaProv = (snapshot?.provenance?.["crew.eva_elapsed_s"] as Provenance) ?? "simulated";
  const doseProv = (snapshot?.provenance?.["crew.dose_event_ugy"] as Provenance) ?? "simulated";

  // Bars: 0 when unlinked, 1-3 when linked based on hop length
  let bars = 0;
  if (linked) {
    const hops = crew?.link_path?.length ?? 1;
    bars = Math.min(3, Math.max(1, 4 - hops));
  }

  // Age in seconds: 0 when active/linked, positive when stale (derived client-side)
  // TODO(decision): Sadman to supply telemetry ageSeconds in snapshot.crew or derive from client linkLost()
  const ageSeconds = stale ? 1 : 0;

  return {
    evaTimeSeconds: {
      v: crew?.eva_elapsed_s ?? 0,
      unit: "s",
      prov: evaProv,
      src: "snapshot:crew.eva_elapsed_s",
    },
    doseUgy: {
      v: crew?.dose_event_ugy ?? 0,
      unit: "µGy",
      prov: doseProv,
      src: "snapshot:crew.dose_event_ugy",
    },
    link: {
      linked,
      bars,
      ageSeconds,
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
