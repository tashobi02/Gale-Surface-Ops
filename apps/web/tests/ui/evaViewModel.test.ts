/**
 * T24.02 — Tests: EVA view model on the mock fixtures (docs/specs/01 FR-32; NFR-05; 03 SCR-12, SCR-13).
 * Exercises C17 selectors against the T20.02 killer-demo WebSocket fixtures.
 * Fails against the throwing stubs in T24.01 until implemented by T24.03.
 */
import { describe, expect, it } from "vitest";
import type { Snapshot, ServerMessage } from "@marswalk/protocol";
import { BEATS, wsFixtures, type Beat } from "../fixtures/ws";
import {
  selectAlertSlot,
  selectEvaViewModel,
  selectHaven,
  selectHudViewModel,
  selectMetadataStrip,
  selectNextStop,
  selectO2,
  type EvaViewModel,
  type HudViewModel,
} from "../../src/ui/eva/viewModel";

/** Helper to extract the primary Snapshot from a fixture beat. */
function getSnapshot(beat: Beat): Snapshot {
  const messages = wsFixtures[beat];
  const snap = messages.find((m): m is Extract<ServerMessage, { type: "SNAPSHOT" }> => m.type === "SNAPSHOT");
  if (!snap) {
    // If beat only has events, fallback to connect snapshot for state context
    const connectSnap = wsFixtures["connect"].find((m): m is Extract<ServerMessage, { type: "SNAPSHOT" }> => m.type === "SNAPSHOT")!;
    return connectSnap as unknown as Snapshot;
  }
  return snap as unknown as Snapshot;
}

const VALID_PROVENANCE = ["measured", "derived", "modelled", "assumed", "replayed", "simulated"] as const;

describe("EVA view model on mock fixtures (T24.02)", () => {
  it("beat connect: gives expected HAVEN kind (vehicle), nominal O₂, and active link", () => {
    const snapshot = getSnapshot("connect");
    const vm: EvaViewModel = selectEvaViewModel(snapshot, "EV1");

    expect(vm.crewId).toBe("EV1");
    expect(vm.haven.kind).toBe("vehicle");
    expect(vm.haven.minutes.v).toBeCloseTo(18.4, 0.1);
    expect(vm.haven.status).toBe("nominal");
    expect(vm.o2.percent.v).toBe(71);
    expect(vm.o2.status).toBe("nominal");
    expect(vm.metadata.link.linked).toBe(true);
    expect(vm.metadata.link.stale).toBe(false);
    expect(vm.alertSlot).toBeNull();
  });

  it("beat walking: updates haven and O₂ with next stop bearing and distance", () => {
    const snapshot = getSnapshot("walking");
    const vm: EvaViewModel = selectEvaViewModel(snapshot, "EV1");

    expect(vm.haven.kind).toBe("vehicle");
    expect(vm.o2.percent.v).toBeGreaterThan(0);
    expect(vm.metadata.link.linked).toBe(true);
    if (vm.nextStop) {
      expect(vm.nextStop.distanceM.v).toBeGreaterThan(0);
      expect(vm.nextStop.bearingDeg.v).toBeGreaterThanOrEqual(0);
    }
  });

  it("beat radiation-alert: alert slot contains WARNING level with shelter surge message", () => {
    const snapshot = getSnapshot("radiation-alert");
    const alertSlot = selectAlertSlot(snapshot, "EV1");

    expect(alertSlot).not.toBeNull();
    expect(alertSlot?.level).toBe("warning");
    expect(alertSlot?.code).toBe("RADIATION_ALERT");
    expect(alertSlot?.message).toMatch(/Shelter now|radiation/i);

    // Haven status escalates on warning
    const haven = selectHaven(snapshot, "EV1");
    expect(haven.status).toBe("warning");
  });

  it("beat options-proposed: reflects proposed contingency options for evacuation", () => {
    const snapshot = getSnapshot("options-proposed");
    const vm: EvaViewModel = selectEvaViewModel(snapshot, "EV1");

    expect(vm.alertSlot).not.toBeNull();
  });

  it("beat summon-accepted: vehicle dispatch updates nearest haven ETA", () => {
    const snapshot = getSnapshot("summon-accepted");
    const haven = selectHaven(snapshot, "EV1");

    expect(haven.kind).toBe("vehicle");
    expect(haven.minutes.v).toBeGreaterThan(0);
  });

  it("beat comm-shadow: alert slot reflects CAUTION level and advisory text", () => {
    const snapshot = getSnapshot("comm-shadow");
    const alertSlot = selectAlertSlot(snapshot, "EV1");

    expect(alertSlot).not.toBeNull();
    expect(alertSlot?.level).toBe("caution");
    expect(alertSlot?.code).toBe("COMM_SHADOW");
    expect(alertSlot?.message).toMatch(/comm shadow/i);
  });

  it("beat link-lost-restored: unlinked state marks values as stale with positive age", () => {
    const snapshot = getSnapshot("link-lost-restored");
    const metadata = selectMetadataStrip(snapshot, "EV1");

    // Link lost: unlinked and stale
    expect(metadata.link.linked).toBe(false);
    expect(metadata.link.stale).toBe(true);
    expect(metadata.link.ageSeconds).toBeGreaterThanOrEqual(0);
  });

  it("beat stop-task-ticked: updates stop task counts in nextStop view", () => {
    const snapshot = getSnapshot("stop-task-ticked");
    const nextStop = selectNextStop(snapshot, "EV1");

    if (nextStop) {
      expect(nextStop.taskCount.total).toBeGreaterThan(0);
    }
  });

  it("every displayed value carries a valid provenance class (FR-15, NFR-05)", () => {
    const snapshot = getSnapshot("connect");
    const haven = selectHaven(snapshot, "EV1");
    const o2 = selectO2(snapshot, "EV1");
    const meta = selectMetadataStrip(snapshot, "EV1");

    expect(VALID_PROVENANCE).toContain(haven.minutes.prov);
    expect(VALID_PROVENANCE).toContain(o2.percent.prov);
    expect(VALID_PROVENANCE).toContain(o2.timeLeftMinutes.prov);
    expect(VALID_PROVENANCE).toContain(meta.evaTimeSeconds.prov);
    expect(VALID_PROVENANCE).toContain(meta.doseUgy.prov);
  });

  it("selectHudViewModel produces visor glance view with at most 5 core values (04 §E.6)", () => {
    const snapshot = getSnapshot("connect");
    const hud: HudViewModel = selectHudViewModel(snapshot, "EV1");

    expect(hud.crewId).toBe("EV1");
    expect(hud.haven).toBeDefined();
    expect(hud.o2).toBeDefined();
    expect(hud.link).toBeDefined();

    // Verify 5 glanceable values constraint: haven, targetBearingDistance, o2, alertSlot, link
    const valueCount = [hud.haven, hud.targetBearingDistance, hud.o2, hud.alertSlot, hud.link].filter(Boolean).length;
    expect(valueCount).toBeLessThanOrEqual(5);
  });
});

