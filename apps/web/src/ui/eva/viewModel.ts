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
 * - Missing or unavailable values render "—" per the 04 no-data rule.
 * - A provenance label is read from the data and checked against the six classes (`isProvenance`), never cast. Where a
 *   snapshot's provenance map has no valid entry for a Crew field, the class 05 gives that field is shown.
 * - A cleared alert (`cleared_seq` set) no longer counts for status or for the alert slot.
 *
 * Contract version: C17 v1 (frozen T24.01, 2026-11-07).
 * Implementation: T24.03 (Ridita Alam).
 */
import type {
  Alert,
  CrewActivity,
  CrewId,
  Provenance,
  Snapshot,
  Waypoint,
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
  /** The vehicle the server tied to this crew member's haven; undefined when it cannot be matched (shown "—"). */
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
 * last-linked sim time; the client does not invent one.
 */
export interface EvaLinkView {
  readonly linked: boolean | null;
  /**
   * Link quality bars: always null for now. No Hab Core field carries link quality and the client does not derive
   * one (N-04).
   */
  readonly bars: number | null;
  /** Radio hops to HAB along the crew member's link path, from the crew record (N-04, BD-103). */
  readonly hops: ProvenanceValue<number | string>;
  /** The kind of the first hop of the link path, from the crew record (N-04, BD-103). */
  readonly via: ProvenanceValue<string>;
  readonly ageSeconds: number | null;
  readonly stale: boolean | null;
}

/** Status of a telemetry card; "unknown" when there is no telemetry to judge (04 §C.1, never a nominal default). */
export type EvaCardStatus = "nominal" | "caution" | "warning" | "unknown";

/** SCR-12 complete view model. */
export interface EvaViewModel {
  readonly crewId: CrewId;
  /** The crew member's activity from the snapshot; null when the crew member is not in it. */
  readonly activity: CrewActivity | null;
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

/** The kinds of first hop the protocol names for a crew member's link path (N-04, BD-103). */
export type LinkVia = "direct" | "relay" | "crew";

const VALID_LINK_VIA: readonly string[] = ["direct", "relay", "crew"];

const PROVENANCE_CLASSES: readonly string[] = ["measured", "derived", "modelled", "assumed", "replayed", "simulated"];
const CREW_ACTIVITIES: readonly string[] = ["IN_HAB", "WALKING", "AT_STOP", "TO_HAVEN", "SHELTERED", "RIDING"];

/** True for exactly the six provenance classes (01 FR-15); anything else, including "live", is not a label. */
export function isProvenance(value: unknown): value is Provenance {
  return typeof value === "string" && PROVENANCE_CLASSES.includes(value);
}

/** The class the data gives, or `fallback` (the class 05 defines for the field) when it gives none that is valid. */
function provenanceOr(value: unknown, fallback: Provenance): Provenance {
  return isProvenance(value) ? value : fallback;
}

function activityOf(value: unknown): CrewActivity | null {
  return typeof value === "string" && CREW_ACTIVITIES.includes(value) ? (value as CrewActivity) : null;
}

/** The alerts that concern this crew member and are still open (`cleared_seq` null; 05 Alert). */
function liveAlerts(snapshot: Snapshot | null, crewId: CrewId): Alert[] {
  return (snapshot?.alerts ?? []).filter(
    (a) => a.cleared_seq == null && (!a.subjects || a.subjects.length === 0 || a.subjects.includes(crewId)),
  );
}

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
  const crewAlerts = liveAlerts(snapshot, crewId);
  const escalationAlert = crewAlerts.find(
    (a) => a.code === "RADIATION_ALERT" || a.code === "HAVEN_TIME_EXCEEDED",
  );

  // No telemetry and no server alert: the status is unknown, not nominal.
  let status: EvaCardStatus = hasMinutes ? "nominal" : "unknown";
  if (escalationAlert) {
    status = escalationAlert.level === "warning" ? "warning" : "caution";
  }

  // The vehicle named by the server's own data: the one whose SUMMON task lists this crew member. No match, or more than
  // one, is unknown (never "any rover", and no guess from positions).
  let targetId: string | undefined;
  if (kind === "vehicle" && snapshot?.vehicles) {
    const summoned = snapshot.vehicles.filter((v) => v.task?.kind === "SUMMON" && v.task.crew_ids?.includes(crewId));
    targetId = summoned.length === 1 ? summoned[0].vehicle_id : undefined;
  }

  const minutes: ProvenanceValue<number | string> = hasMinutes
    ? {
        v: rawMinutes,
        unit: "min",
        prov: provenanceOr(snapshot?.provenance?.["crew.haven.minutes"], "modelled"),
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
  const crewAlerts = liveAlerts(snapshot, crewId);
  const o2Alert = crewAlerts.find((a) => a.code === "CONSUMABLES_LOW");
  let status: EvaCardStatus = hasFrac ? "nominal" : "unknown";
  if (o2Alert) {
    status = o2Alert.level === "warning" ? "warning" : "caution";
  }

  // Time left comes from the crew record, or is unavailable.
  // Its class is the server's, from the alert's own provenance (simulated today); a number without a valid class is not
  // shown, because FR-15 allows no unlabelled value.
  const crewTimeLeft = crew?.o2_remaining_min;
  const rawTimeLeft: unknown = o2Alert?.data.o2_remaining_min;
  const rawTimeLeftProv: unknown = o2Alert?.data.provenance?.["data.o2_remaining_min"];
  const alertTimeLeft = isFiniteNumber(rawTimeLeft) && isProvenance(rawTimeLeftProv) ? rawTimeLeft : undefined;
  const timeLeftMinutes = alertTimeLeft !== undefined ? alertTimeLeft : UNAVAILABLE;
  const timeLeftProv: Provenance | null = alertTimeLeft !== undefined && isProvenance(rawTimeLeftProv) ? rawTimeLeftProv : null;
  const timeLeftSrc = alertTimeLeft !== undefined ? "hab-core:alert.o2_remaining_min" : "unavailable:crew.o2_time_left_min";

  // Provenance: simulated, never "measured"
  const percent: ProvenanceValue<number | string> = hasFrac
    ? {
        v: Math.round(frac * 100),
        unit: "%",
        prov: provenanceOr(snapshot?.provenance?.["crew.o2_frac"], "simulated"),
        src: "snapshot:crew.o2_frac",
      }
    : unavailable("crew.o2_frac", "simulated");

  return {
    percent,
    timeLeftMinutes: isFiniteNumber(crewTimeLeft) ? {
      v: crewTimeLeft, unit: "min", prov: provenanceOr(snapshot?.provenance?.["crew.o2_remaining_min"], "simulated"),
      src: "snapshot:crew.o2_remaining_min",
    } : {
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

  const alerts = liveAlerts(snapshot, crewId);

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

  // Contingency options never make an alert of their own: the slot shows alerts the Hab Core raised, nothing else.
  return null;
}

/**
 * The plan stop this crew member is heading for. The engine's `stop_index` is one-based and names the stop the crew
 * member last arrived at or left (apps/hab-core tick.ts, engine/tasks.ts): stop number n is `stops[n - 1]`. The stop that
 * is next — the first one of the current plan revision not yet reached by this crew member (FD-047) — is therefore
 * `stops[stop_index]` for both AT_STOP and WALKING: at stop n the next is n + 1 (`stops[n]`), and walking the next is
 * the one after the last reached. This is the same array index the Hab Core's own crew margins use
 * (apps/hab-core/src/engine/crewMargins.ts: "at a stop the next stop is the following one, not the one they stand at"),
 * so the NEXT card's bearing, distance and ETA name the stop the card names.
 *
 * TO_HAVEN and SHELTERED head for no stop, and an index outside the plan's stops is unknown: null, never stop 1 or the hab.
 * `stop_index` is null before the crew member reached any stop: the next stop is then the first of the plan.
 */
function planStopFor(stops: Waypoint[], activity: CrewActivity | null, stopIndex: number | null | undefined): Waypoint | null {
  if (activity === "TO_HAVEN" || activity === "SHELTERED") return null;
  const index = stopIndex ?? null;
  if (index !== null && !Number.isInteger(index)) return null;
  // The index is one-based: 0 is not a stop the engine names, so it is unknown, never the first stop.
  if (index !== null && index < 1) return null;
  return stops[index ?? 0] ?? null;
}

/**
 * Next stop card. Navigation is supplied by Hab Core; the UI does not calculate route geometry.
 */
export function selectNextStop(snapshot: Snapshot | null, crewId: CrewId): EvaNextStopView | null {
  if (!snapshot) return null;
  const crew = snapshot.crew?.find((c) => c.crew_id === crewId);
  const activity = activityOf(crew?.activity);

  const waypoints = snapshot.plan?.waypoints ?? [];
  const stops = waypoints.filter((w) => w.role === "stop");
  // Tasks this crew member may see: their own or "either crew" (crew_id null). Never another crew's.
  const eligibleTasks = (snapshot.tasks ?? []).filter((t) => t.crew_id === null || t.crew_id === crewId);
  let stopId: string | null = null;
  let stopName = "";

  // The stop the NEXT card names is the stop the navigation points at (FD-047): the crew member's own next stop, which
  // the Hab Core's crew margins compute as `stops[crew.stop_index]` (apps/hab-core/src/engine/crewMargins.ts) — the same
  // array index the engine's own `next_stop_target` names for a single crew member
  // (apps/hab-core/src/engine/nextStop.ts: `stops[min(stop_index)]`). The card's name, its task count and its bearing,
  // distance and ETA therefore all name the same stop.
  //
  // `snapshot.next_stop_target` is the CREW-WIDE jump target (05 Snapshot: "the crew-wide next stop of 02 §D.17"), so it
  // is not this crew member's navigation and must not override it: with two crew members at different stops the jump
  // target and the per-crew navigation differ, and the card must follow the navigation it shows. The target is used only
  // when the snapshot carries no plan stops to index into — then it is the only stop named by the server.
  const target = snapshot.next_stop_target?.stop_id ?? null;
  const targetWp = target ? stops.find((w) => w.id === target) ?? null : null;
  const planWp = stops.length > 0 ? planStopFor(stops, activity, crew?.stop_index) : null;
  if (planWp) {
    stopId = planWp.id;
    stopName = planWp.label || `Stop ${stopId.replace(/^wp-/, "")}`;
  } else if (target && crew) {
    // The crew member is in the snapshot but the plan's stops are not: the crew-wide target is then the only stop the
    // server names, and it is this crew member's too.
    stopId = target;
    // The name comes from the plan when the plan carries the stop; otherwise from the target's own stop number.
    stopName = targetWp?.label || `Stop ${String(snapshot.next_stop_target?.stop_index ?? target.replace(/^wp-/, ""))}`;
  }

  // With no plan and no next-stop target there is no stop to navigate to: the NEXT card reads "—", never the stop of the
  // first task.
  if (!stopId) {
    return null;
  }

  const tasks = eligibleTasks.filter((t) => t.stop_id === stopId);
  const done = tasks.filter((t) => t.state === "DONE").length;

  const navigation = (value: unknown, field: string, unit: string, prov: Provenance): ProvenanceValue<number | string> =>
    isFiniteNumber(value)
      ? { v: value, unit, prov: provenanceOr(snapshot.provenance?.[`crew.${field}`], prov), src: `snapshot:crew.${field}` }
      : unavailable(`crew.${field}`, prov);

  return {
    stopId,
    stopName,
    // An unavailable value keeps the class its field always has: the bearing and the distance are derived and the ETA is
    // modelled whatever the snapshot supplies, so the reader can tell what kind of number is missing (never a bare "—"
    // with no class).
    bearingDeg: isFiniteNumber(crew?.next_stop_bearing_deg) ? navigation(crew.next_stop_bearing_deg, "next_stop_bearing_deg", "°", "derived") : unavailable("next_stop.bearing_deg", "derived"),
    distanceM: isFiniteNumber(crew?.next_stop_distance_m) ? navigation(crew.next_stop_distance_m, "next_stop_distance_m", "m", "derived") : unavailable("next_stop.distance_m", "derived"),
    etaMinutes: isFiniteNumber(crew?.next_stop_eta_s) ? navigation(crew.next_stop_eta_s / 60, "next_stop_eta_s", "min", "modelled") : unavailable("next_stop.eta_min", "modelled"),
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
  const evaProv = provenanceOr(snapshot?.provenance?.["crew.eva_elapsed_s"], "simulated");
  const doseProv = provenanceOr(snapshot?.provenance?.["crew.dose_event_ugy"], "simulated");

  const eva: unknown = crew?.eva_elapsed_s;
  const dose: unknown = crew?.dose_event_ugy;
  const currentTime = snapshot?.sim_time ? Date.parse(snapshot.sim_time) : NaN;
  const linkedTime = crew?.last_linked_sim_time ? Date.parse(crew.last_linked_sim_time) : NaN;
  const ageSeconds = Number.isFinite(currentTime) && Number.isFinite(linkedTime) && currentTime >= linkedTime
    ? (currentTime - linkedTime) / 1000 : null;

  // The link path of N-04: the hops to HAB and the kind of the first hop, both from the crew record. The client
  // computes neither, and there is no bar count to show: 02 §D.11 models line of sight only (BD-103).
  const hopsProv = provenanceOr(snapshot?.provenance?.["crew.link_hops"], "simulated");
  const viaProv = provenanceOr(snapshot?.provenance?.["crew.link_via"], "simulated");
  const rawHops: unknown = crew?.link_hops;
  const rawVia: unknown = crew?.link_via;
  const hops: ProvenanceValue<number | string> = isFiniteNumber(rawHops)
    ? { v: rawHops, unit: "hops", prov: hopsProv, src: "snapshot:crew.link_hops" }
    : unavailable("crew.link_hops", hopsProv);
  const via: ProvenanceValue<string> = VALID_LINK_VIA.includes(rawVia as LinkVia)
    ? { v: rawVia as LinkVia, unit: "", prov: viaProv, src: "snapshot:crew.link_via" }
    : unavailable("crew.link_via", viaProv);

  return {
    evaTimeSeconds: isFiniteNumber(eva)
      ? { v: eva, unit: "s", prov: evaProv, src: "snapshot:crew.eva_elapsed_s" }
      : unavailable("crew.eva_elapsed_s", "simulated"),
    doseUgy: isFiniteNumber(dose)
      ? { v: dose, unit: "µGy", prov: doseProv, src: "snapshot:crew.dose_event_ugy" }
      : unavailable("crew.dose_event_ugy", "simulated"),
    link: {
      linked,
      bars: null,
      hops,
      via,
      ageSeconds,
      stale,
    },
  };
}

export function selectEvaViewModel(snapshot: Snapshot | null, crewId: CrewId): EvaViewModel {
  return {
    crewId,
    activity: activityOf(snapshot?.crew?.find((c) => c.crew_id === crewId)?.activity),
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
