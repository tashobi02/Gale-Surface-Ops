/**
 * C17 — EVA view model selectors (docs/specs/03 SCR-12, SCR-13; 04 §E.5, §E.6; FR-32, FR-33, NFR-05).
 * Selectors from the Hab Core client store Snapshot to what the EVA tablet and HUD display.
 * Every displayed mission value carries {v, unit, prov, src} to satisfy FR-15 / data-provenance.
 *
 * Contract version: C17 v1 (frozen T24.01, 2026-11-07).
 * Implementation: T24.03.
 * Stubs throw until implemented.
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
// Selectors (throwing stubs for T24.01 contract; implemented by T24.03)
// ---------------------------------------------------------------------------

export function selectHaven(snapshot: Snapshot | null, crewId: CrewId): EvaHavenView {
  throw new Error("TODO(TASK-24): not implemented");
}

export function selectO2(snapshot: Snapshot | null, crewId: CrewId): EvaO2View {
  throw new Error("TODO(TASK-24): not implemented");
}

export function selectNextStop(snapshot: Snapshot | null, crewId: CrewId): EvaNextStopView | null {
  throw new Error("TODO(TASK-24): not implemented");
}

export function selectAlertSlot(snapshot: Snapshot | null, crewId: CrewId): EvaAlertSlotView | null {
  throw new Error("TODO(TASK-24): not implemented");
}

export function selectMetadataStrip(snapshot: Snapshot | null, crewId: CrewId): EvaMetadataStripView {
  throw new Error("TODO(TASK-24): not implemented");
}

export function selectEvaViewModel(snapshot: Snapshot | null, crewId: CrewId): EvaViewModel {
  throw new Error("TODO(TASK-24): not implemented");
}

export function selectHudViewModel(snapshot: Snapshot | null, crewId: CrewId): HudViewModel {
  throw new Error("TODO(TASK-24): not implemented");
}

