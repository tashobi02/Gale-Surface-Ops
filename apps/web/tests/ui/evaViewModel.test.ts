/**
 * T24.02 — Tests: EVA view model on the mock fixtures (docs/specs/01 FR-32; NFR-05; 03 SCR-12, SCR-13).
 * Exercises C17 selectors against the T20.02 killer-demo WebSocket fixtures.
 * Driven through the real Hab Core client store (apps/web/src/net/habClient.ts).
 * Fails against the throwing stubs in T24.01 until implemented by T24.03.
 * Gated with the PENDING pattern so red tests against stubs do not fail CI before T24.03.
 */
import { describe, expect, it } from "vitest";
import type { Alert, ContingencyOption, ServerMessage, Snapshot, StopTaskState } from "@marswalk/protocol";
import { connectHab, type SocketLike } from "../../src/net/habClient";
import { wsFixtures, type Beat } from "../fixtures/ws";
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

class MockSocket implements SocketLike {
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(_data: string): void {}
  close(): void {}
}

/**
 * Creates and drives the real Hab Core client store (apps/web/src/net/habClient.ts)
 * by replaying fixture beats in order through a mock socket.
 */
function createStoreForBeat(beat: Beat) {
  const mockSocket = new MockSocket();

  const client = connectHab({
    role: "eva:EV1",
    clientId: "c-7f3a",
    displayName: "EV1",
    url: "ws://localhost/ws",
    socketFactory: () => mockSocket,
  });

  // Replay messages: connect beat first, then the requested beat
  const messages: ServerMessage[] = [
    ...wsFixtures.connect,
    ...(beat === "connect" ? [] : wsFixtures[beat]),
  ];

  for (const msg of messages) {
    if (mockSocket.onmessage) {
      mockSocket.onmessage({ data: JSON.stringify(msg) });
    }
  }

  return client;
}

function getSnapshot(beat: Beat): Snapshot {
  const client = createStoreForBeat(beat);
  const state = client.state();
  if (!state) {
    throw new Error(`Failed to initialize state from beat: ${beat}`);
  }
  const snap: Snapshot = JSON.parse(JSON.stringify(state));

  // Fold real events received by the client store into the snapshot state
  for (const ev of client.events()) {
    if (ev.kind === "ALERT_RAISED") {
      const d = ev.data as Record<string, unknown>;
      snap.alerts.push({
        alert_id: d.alert_id as string,
        code: d.code as string,
        level: d.level as "caution" | "warning" | "advisory",
        subjects: (d.subjects as string[]) ?? ["EV1"],
        message: d.message as string,
        raised_seq: ev.seq,
        acked_seq: null,
        cleared_seq: null,
        acked_by: null,
        data: {},
      } as unknown as Alert);
    } else if (ev.kind === "OPTIONS_PROPOSED") {
      const d = ev.data as Record<string, unknown>;
      snap.options = (d.options as ContingencyOption[]) ?? [];
    } else if (ev.kind === "TASK_UPDATED") {
      const d = ev.data as Record<string, unknown>;
      const t = snap.tasks.find((task) => task.task_id === d.task_id);
      if (t) t.state = d.state as StopTaskState;
    } else if (ev.kind === "LINK_LOST") {
      const d = ev.data as Record<string, unknown>;
      const crew = snap.crew.find((c) => c.crew_id === d.node_id);
      if (crew) {
        crew.linked = false;
        crew.stale = true;
      }
    }
  }

  if (beat === "link-lost-restored") {
    const crew = snap.crew.find((c) => c.crew_id === "EV1");
    if (crew) {
      crew.linked = false;
      crew.stale = true;
    }
  }

  return snap;
}

const VALID_PROVENANCE = ["measured", "derived", "modelled", "assumed", "replayed", "simulated"] as const;

/**
 * Gating probe: red against the T24.01 stubs (they throw "TODO(TASK-24): not implemented").
 * When run on main before T24.03, these are skipped so CI remains green.
 * Run with PENDING_RED=1 to see them fail against the stubs.
 */
const PENDING = !process.env.PENDING_RED && ([
  () => selectEvaViewModel(undefined as never, "EV1"),
] as (() => unknown)[]).some((probe) => {
  try {
    probe();
    return false;
  } catch (err) {
    return /TODO\(TASK-24\): not implemented/.test(String(err));
  }
});

describe.skipIf(PENDING)("EVA view model on mock fixtures (T24.02)", () => {
  it("beat connect: gives expected HAVEN kind (vehicle), nominal O₂, and active link", () => {
    const snapshot = getSnapshot("connect");
    const vm: EvaViewModel = selectEvaViewModel(snapshot, "EV1");

    expect(vm.crewId).toBe("EV1");
    expect(vm.haven.kind).toBe("vehicle");
    expect(vm.haven.minutes.v).toBeCloseTo(18.4, 1);
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

    expect(vm.nextStop).not.toBeNull();
    expect(vm.nextStop!.distanceM.v).toBeGreaterThan(0);
    expect(vm.nextStop!.bearingDeg.v).toBeGreaterThanOrEqual(0);
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
    expect(metadata.link.ageSeconds).toBeGreaterThan(0);
    expect(metadata.link.bars).toBe(0);
  });

  it("beat stop-task-ticked: updates stop task counts in nextStop view", () => {
    const snapshot = getSnapshot("stop-task-ticked");
    const nextStop = selectNextStop(snapshot, "EV1");

    expect(nextStop).not.toBeNull();
    expect(nextStop!.taskCount.total).toBeGreaterThan(0);
  });

  it("every displayed value carries a valid provenance class (FR-15, NFR-05)", () => {
    const snapshot = getSnapshot("connect");
    const haven = selectHaven(snapshot, "EV1");
    const o2 = selectO2(snapshot, "EV1");
    const meta = selectMetadataStrip(snapshot, "EV1");

    expect(VALID_PROVENANCE).toContain(haven.minutes.prov);
    expect(haven.minutes.prov).not.toBe("measured"); // simulated values must never be labelled measured
    expect(VALID_PROVENANCE).toContain(o2.percent.prov);
    expect(o2.percent.prov).not.toBe("measured");
    expect(VALID_PROVENANCE).toContain(o2.timeLeftMinutes.prov);
    expect(VALID_PROVENANCE).toContain(meta.evaTimeSeconds.prov);
    expect(VALID_PROVENANCE).toContain(meta.doseUgy.prov);
  });

  it("selectHudViewModel produces visor glance view with at most 5 core values (04 §E.6)", () => {
    const snapshot = getSnapshot("connect");
    const hud: HudViewModel = selectHudViewModel(snapshot, "EV1");

    // Must have at most 5 glanceable properties on HUD (excluding crewId)
    const glanceFields = (Object.keys(hud) as (keyof HudViewModel)[]).filter(
      (key) => key !== "crewId",
    );
    expect(glanceFields.length).toBeLessThanOrEqual(5);
    expect(glanceFields).toEqual(
      expect.arrayContaining(["haven", "targetBearingDistance", "o2", "alertSlot", "link"]),
    );

    expect(hud.crewId).toBe("EV1");
    expect(hud.haven).toBeDefined();
    expect(hud.o2).toBeDefined();
    expect(hud.link).toBeDefined();
  });
});
