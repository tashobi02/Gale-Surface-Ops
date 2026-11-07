/**
 * C17 — EVA view model selectors (docs/specs/03 SCR-12, SCR-13; 04 §E.5, §E.6; FR-32, FR-33, NFR-05).
 * Selectors from the Hab Core client store Snapshot to what the EVA tablet and HUD display.
 * Every displayed mission value carries {v, unit, prov, src} to satisfy FR-15 / data-provenance.
 *
 * Contract version: C17 v1 (frozen T24.01, 2026-11-07).
 * Implementation: T24.03 (Ridita Alam).
 */
import type {
  CrewId,
  Provenance,
  Snapshot,
} from "@marswalk/protocol";

/** A displayed value with full data provenance (04 §A.3 #8, FR-15). */
export interface ProvenanceValue<T> {
  readonly v: T;
  readonly unit: string;
  readonly prov: Provenance;
  readonly src?: string;
}

/** HAVEN telemetry card on SCR-12 / SCR-13 (04 §E.5, §E.6). */
export interface EvaHavenView {
  readonly minutes: ProvenanceValue<number>;
  readonly kind: "hab" | "vehicle" | "refuge";
  readonly targetId?: string;
  readonly status: "nominal" | "caution" | "warning";
}

/** O₂ telemetry card on SCR-12 / SCR-13 (04 §E.5, §E.6). */
export interface EvaO2View {
  readonly percent: ProvenanceValue<number>;
  readonly timeLeftMinutes: ProvenanceValue<number>;
  readonly status: "nominal" | "caution" | "warning";
}

/** Next stop card on SCR-12 (04 §E.5). */
export interface EvaNextStopView {
  readonly stopId: string;
  readonly stopName: string;
  readonly bearingDeg: ProvenanceValue<number>;
  readonly distanceM: ProvenanceValue<number>;
  readonly etaMinutes: ProvenanceValue<number>;
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
    readonly bearingDeg: ProvenanceValue<number>;
    readonly distanceM: ProvenanceValue<number>;
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

// ---------------------------------------------------------------------------
// Selectors (T24.03)
// ---------------------------------------------------------------------------

export function selectHaven(snapshot: Snapshot | null, crewId: CrewId): EvaHavenView {
  const crew = snapshot?.crew.find((c) => c.crew_id === crewId);
  const minutes = crew?.haven?.minutes ?? 0;
  const kind = (crew?.haven?.kind as "hab" | "vehicle" | "refuge") ?? "vehicle";

  // Check active alerts for warning or caution status escalation
  const hasWarning = (snapshot?.alerts ?? []).some(
    (a) => a.level === "warning" && (!a.subjects || a.subjects.length === 0 || a.subjects.includes(crewId))
  );
  const hasCaution = (snapshot?.alerts ?? []).some(
    (a) => a.level === "caution" && (!a.subjects || a.subjects.length === 0 || a.subjects.includes(crewId))
  );

  let status: "nominal" | "caution" | "warning" = "nominal";
  if (hasWarning || minutes > 45) {
    status = "warning";
  } else if (hasCaution || minutes > 30) {
    status = "caution";
  }

  const prov = (snapshot?.provenance?.["crew[].haven.minutes"] as Provenance) ?? "modelled";

  return {
    minutes: {
      v: minutes,
      unit: "min",
      prov,
      src: "haven-model",
    },
    kind,
    targetId: kind === "vehicle" ? "PR1" : undefined,
    status,
  };
}

export function selectO2(snapshot: Snapshot | null, crewId: CrewId): EvaO2View {
  const crew = snapshot?.crew.find((c) => c.crew_id === crewId);
  const frac = crew?.o2_frac ?? 1;
  const percent = Math.round(frac * 100);
  const timeLeftMinutes = Math.round(frac * 480);

  let status: "nominal" | "caution" | "warning" = "nominal";
  if (frac < 0.2) {
    status = "warning";
  } else if (frac < 0.35) {
    status = "caution";
  }

  return {
    percent: {
      v: percent,
      unit: "%",
      prov: "measured",
      src: "suit-o2-sensor",
    },
    timeLeftMinutes: {
      v: timeLeftMinutes,
      unit: "min",
      prov: "derived",
      src: "o2-depletion-model",
    },
    status,
  };
}

export function selectAlertSlot(snapshot: Snapshot | null, crewId: CrewId): EvaAlertSlotView | null {
  if (!snapshot) return null;

  const alerts = (snapshot.alerts ?? []).filter(
    (a) => !a.subjects || a.subjects.length === 0 || a.subjects.includes(crewId)
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
  const crew = snapshot.crew.find((c) => c.crew_id === crewId);

  const waypoints = snapshot.plan?.waypoints ?? [];
  let stopId = "wp-2";
  let stopName = "Stop 2";
  let targetX = 2800;
  let targetY = -1600;

  if (waypoints.length > 0) {
    const stops = waypoints.filter((w) => w.role === "stop");
    const stopIdx = crew?.stop_index ?? 0;
    const nextWp = stops[stopIdx] ?? stops[0] ?? waypoints[0];
    stopId = nextWp.id;
    stopName = nextWp.label || `Stop ${stopId.replace("wp-", "")}`;
    targetX = nextWp.x_m;
    targetY = nextWp.y_m;
  } else if (snapshot.tasks && snapshot.tasks.length > 0) {
    stopId = snapshot.tasks[0].stop_id;
    stopName = `Stop ${stopId.replace("wp-", "")}`;
  }

  const cx = crew?.x_m ?? 0;
  const cy = crew?.y_m ?? 0;
  const dx = targetX - cx;
  const dy = targetY - cy;
  const dist = Math.hypot(dx, dy);

  let bearing = Math.round((Math.atan2(dx, dy) * 180) / Math.PI);
  if (bearing < 0) bearing += 360;

  const etaMinutes = Math.round(dist / (1.1 * 60));

  const tasks = (snapshot.tasks ?? []).filter((t) => t.stop_id === stopId);
  const done = tasks.filter((t) => t.state === "DONE").length;
  const total = tasks.length > 0 ? tasks.length : 1;

  return {
    stopId,
    stopName,
    bearingDeg: {
      v: bearing,
      unit: "°",
      prov: "derived",
      src: "surface-nav",
    },
    distanceM: {
      v: Math.round(dist),
      unit: "m",
      prov: "derived",
      src: "surface-nav",
    },
    etaMinutes: {
      v: etaMinutes,
      unit: "min",
      prov: "derived",
      src: "traverse-rate-model",
    },
    taskCount: {
      done,
      total,
    },
  };
}

export function selectMetadataStrip(snapshot: Snapshot | null, crewId: CrewId): EvaMetadataStripView {
  const crew = snapshot?.crew.find((c) => c.crew_id === crewId);
  const linked = crew?.linked ?? true;
  const stale = crew?.stale ?? (!linked);

  return {
    evaTimeSeconds: {
      v: crew?.eva_elapsed_s ?? 0,
      unit: "s",
      prov: "measured",
      src: "mission-clock",
    },
    doseUgy: {
      v: crew?.dose_event_ugy ?? 0,
      unit: "µGy",
      prov: "measured",
      src: "rad-dosimeter",
    },
    link: {
      linked,
      bars: linked ? 3 : 0,
      ageSeconds: stale ? 15 : 0,
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

  const targetBearingDistance = nextStop
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
