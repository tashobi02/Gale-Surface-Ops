/**
 * T24.04–T24.08 follow-ups — EVA screens read the session store and handle command results
 * (docs/specs/01 FR-32, FR-33, FR-50; 03 SCR-12, SCR-13, SCR-14, SCR-18; 04 §A.3, §E.5).
 * The real components are mounted over a real client store (fake socket, T20.02 fixtures) or over the recording client of
 * fixtureStore.ts; timers are faked where the 5 s undo window matters.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import type { ServerMessage, Snapshot } from "@marswalk/protocol";
import { connectHab, type HabClient, type SocketLike } from "../../src/net/habClient";
import { STOP_TASK_UNDO_WINDOW_MS } from "../../src/ui/screens/scr12/useStopTaskChanges";
import { EvaTablet, type EvaTabletProps } from "../../src/ui/screens/scr12EvaTablet";
import { Hud, type HudProps } from "../../src/ui/screens/scr13Hud";
import { HabLinkLost, type HabLinkLostProps } from "../../src/ui/screens/scr18HabLinkLost";
import { Options, type OptionsProps } from "../../src/ui/screens/scr14Options";
import { wsFixtures } from "../fixtures/ws";
import { recordingClient, rejected, storeFromBeat } from "./fixtureStore";
import { click, flush, installDom, mount, must, removeDom } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

class FakeSocket implements SocketLike {
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(_data: string): void {}
  close(): void {}
  async receive(...messages: ServerMessage[]): Promise<void> {
    await act(async () => {
      for (const m of messages) this.onmessage?.({ data: JSON.stringify(m) });
    });
  }
}

function liveClient(role: "eva:EV1" | "eva:EV2" = "eva:EV1"): { client: HabClient; socket: FakeSocket } {
  const socket = new FakeSocket();
  const client = connectHab({ role, clientId: "c-test", displayName: role, url: "ws://localhost/ws", socketFactory: () => socket });
  return { client, socket };
}

const connect = (): Snapshot => wsFixtures.connect[0] as Snapshot;

/** The connect snapshot with EV1 `AT_STOP` at the fixture's task stop, so the task list shows in full. */
function atStop(over: Partial<Snapshot["crew"][number]> = {}): Snapshot {
  const base = storeFromBeat("connect").state()!;
  return { ...base, crew: base.crew.map((c) => ({ ...c, activity: "AT_STOP" as const, ...over })) };
}

const valueText = (root: HTMLElement, slot: string): string => must(root, `[data-slot="${slot}"] .value`).textContent ?? "";

describe("the EVA screens subscribe to the session store (no remount)", () => {
  it("SCR-12 follows a new SNAPSHOT and STATE_DELTA on the same DOM nodes", async () => {
    const { client, socket } = liveClient();
    const { container } = await mount(createElement(EvaTablet, { client, crewId: "EV1" }));
    expect(valueText(container, "haven")).toBe("—");
    await socket.receive(...wsFixtures.connect);
    const haven = must(container, '[data-slot="haven"] .value');
    expect(haven.textContent).toBe("18");

    await socket.receive({ v: 1, type: "STATE_DELTA", seq: 413, sim_time: "", changes: [{ path: "crew/EV1/haven/minutes", value: 25.4 }, { path: "crew/EV1/o2_frac", value: 0.5 }] });
    expect(must(container, '[data-slot="haven"] .value')).toBe(haven);
    expect(haven.textContent).toBe("25");
    expect(valueText(container, "o2")).toBe("50");
  });

  it("SCR-13 follows the store", async () => {
    const { client, socket } = liveClient();
    const { container } = await mount(createElement(Hud, { client, crewId: "EV1" }));
    expect(valueText(container, "hud-o2")).toBe("—");
    await socket.receive(...wsFixtures.connect);
    expect(valueText(container, "hud-o2")).toBe("71");
    await socket.receive(...wsFixtures.walking);
    expect(valueText(container, "hud-o2")).toBe("71");
    await socket.receive({ v: 1, type: "STATE_DELTA", seq: 414, sim_time: "", changes: [{ path: "crew/EV1/o2_frac", value: 0.42 }] });
    expect(valueText(container, "hud-o2")).toBe("42");
  });

  it("SCR-18 follows the store", async () => {
    const { client, socket } = liveClient();
    const { container } = await mount(createElement(HabLinkLost, { client, crewId: "EV1" }));
    expect(must(container, '[data-slot="cached-telemetry"] .value').textContent).toBe("—");
    await socket.receive(...wsFixtures.connect);
    expect(must(container, '[data-slot="cached-telemetry"] .value').textContent).toBe("18");
  });

  it("SCR-14 lists options that arrive in a later SNAPSHOT", async () => {
    const { client, socket } = liveClient();
    const { container } = await mount(createElement(Options, { client, crewId: "EV1" }));
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(0);

    const option = { option_id: "o1", alert_id: "a-1", kind: "ABORT_TO_HAB" as const, crew_ids: ["EV1" as const], eta_shelter_min: 9, expected_dose_ugy: 1, stops_dropped: [], violations: [], rank: 1, path_preview: [], rendezvous: null };
    await socket.receive({ ...connect(), options: [option] });
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(1);
  });
});

describe("stop task changes wait out the 5 s undo window, then report the Hab Core's answer (FR-50)", () => {
  async function tablet(answer?: Parameters<typeof recordingClient>[1], snapshot: Snapshot = atStop()) {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect"), answer);
    const view = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot }));
    await click(must(view.container, '[data-testid="tasks-button"]'));
    return { ...view, sent, client };
  }
  const tick = (c: HTMLElement) => click(must(c, '[aria-label^="Mark task done: Image"]'));
  const advance = async (ms: number) => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
    await flush();
  };
  const rowState = (c: HTMLElement) => must(c, '[data-testid="task-row-t-s2-02"]').getAttribute("data-state");

  it("the undo window is the 5 s of 01 FR-50", () => {
    expect(STOP_TASK_UNDO_WINDOW_MS).toBe(5000);
  });

  it("a tick shows DONE with UNDO at once but sends only when the window ends", async () => {
    const { container, sent } = await tablet();
    await tick(container);

    expect(rowState(container)).toBe("DONE");
    expect(container.querySelector('[aria-label^="Undo task change: Image"]')).not.toBeNull();
    await advance(STOP_TASK_UNDO_WINDOW_MS - 1);
    expect(sent).toHaveLength(0);
    await advance(1);
    expect(sent).toEqual([{ kind: "UPDATE_STOP_TASK", args: { task_id: "t-s2-02", state: "DONE" } }]);
  });

  it("UNDO inside the window cancels on the client: nothing is ever sent and the row is TODO again", async () => {
    const { container, sent } = await tablet();
    await tick(container);
    await advance(2000);
    await click(must(container, '[aria-label^="Undo task change: Image"]'));

    expect(rowState(container)).toBe("TODO");
    expect(container.querySelector('[aria-label^="Undo task change"]')).toBeNull();
    await advance(STOP_TASK_UNDO_WINDOW_MS * 2);
    expect(sent).toHaveLength(0);
  });

  it("after the window there is no UNDO and no command ever carries state TODO", async () => {
    const { container, sent } = await tablet();
    await tick(container);
    await advance(STOP_TASK_UNDO_WINDOW_MS);

    expect(container.querySelector('[aria-label^="Undo task change"]')).toBeNull();
    expect(sent.map((c) => c.args.state)).toEqual(["DONE"]);
    expect(sent.some((c) => c.args.state === "TODO")).toBe(false);
  });

  it("SKIP waits for a reason, then holds it for the window; UNDO cancels it too", async () => {
    const { container, sent } = await tablet();
    await click(must(container, '[aria-label^="Skip task: Image"]'));
    await click(must(container, '[aria-label="Reason: terrain"]'));
    expect(rowState(container)).toBe("SKIPPED");
    expect(sent).toHaveLength(0);
    await click(must(container, '[aria-label^="Undo task change: Image"]'));
    await advance(STOP_TASK_UNDO_WINDOW_MS * 2);
    expect(sent).toHaveLength(0);

    await click(must(container, '[aria-label^="Skip task: Image"]'));
    await click(must(container, '[aria-label="Reason: time"]'));
    await advance(STOP_TASK_UNDO_WINDOW_MS);
    expect(sent).toEqual([{ kind: "UPDATE_STOP_TASK", args: { task_id: "t-s2-02", state: "SKIPPED", reason: "time" } }]);
  });

  it("a rejected change leaves the row at the server's state and marks it 'not synced'", async () => {
    const { container, sent } = await tablet(() => rejected("INVALID", "illegal task transition"));
    await tick(container);
    await advance(STOP_TASK_UNDO_WINDOW_MS);

    expect(sent).toHaveLength(1);
    expect(rowState(container)).toBe("TODO");
    expect(must(container, '[data-testid="task-row-t-s2-02"] .tag-sync').textContent).toBe("not synced");
    expect(must(container, '[data-testid="stop-task-list"]').textContent).toContain("not synced");
  });

  it("an accepted change shows no 'not synced'", async () => {
    const { container } = await tablet();
    await tick(container);
    await advance(STOP_TASK_UNDO_WINDOW_MS);

    expect(container.querySelector(".tag-sync")).toBeNull();
  });

  it("a change still queued while unlinked reads 'not synced' (01 FR-50)", async () => {
    const never = new Promise<never>(() => {});
    const unlinked = (): Snapshot => {
      const s = atStop();
      return { ...s, crew: s.crew.map((c) => ({ ...c, linked: false })) };
    };
    const { container } = await tablet(() => never, unlinked());
    await tick(container);
    await advance(STOP_TASK_UNDO_WINDOW_MS);

    expect(rowState(container)).toBe("DONE");
    expect(must(container, '[data-testid="task-row-t-s2-02"] .tag-sync').textContent).toBe("not synced");
  });

  it("starting a second change sends the first at once (one undoable change at a time)", async () => {
    const snap = atStop();
    const second = { ...snap.tasks[0], task_id: "t-s2-03", text: "Sample the vein" };
    const { container, sent } = await tablet(undefined, { ...snap, tasks: [...snap.tasks, second] });
    await tick(container);
    await click(must(container, '[aria-label^="Mark task done: Sample"]'));

    expect(sent).toEqual([{ kind: "UPDATE_STOP_TASK", args: { task_id: "t-s2-02", state: "DONE" } }]);
    await advance(STOP_TASK_UNDO_WINDOW_MS);
    expect(sent.map((c) => c.args.task_id)).toEqual(["t-s2-02", "t-s2-03"]);
  });

  it("leaving the tablet inside the window sends the pending change rather than dropping it", async () => {
    const { container, sent, unmount } = await tablet();
    await tick(container);
    await unmount();

    expect(sent).toEqual([{ kind: "UPDATE_STOP_TASK", args: { task_id: "t-s2-02", state: "DONE" } }]);
  });

  it("the TASKS count follows the held change", async () => {
    const { container } = await tablet();
    expect(must(container, '[data-testid="tasks-button"]').textContent).toContain("0/1");
    await tick(container);
    expect(must(container, '[data-testid="tasks-button"]').textContent).toContain("1/1");
  });
});

describe("the task list collapses to its count while walking or during an alert (FR-50, 04 §E.5)", () => {
  async function open(snapshot: Snapshot) {
    const { client } = recordingClient(storeFromBeat("connect"));
    const view = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot }));
    await click(must(view.container, '[data-testid="tasks-button"]'));
    return view;
  }
  const alert = (level: "warning" | "caution"): Snapshot["alerts"][number] => ({
    alert_id: "a-1", code: "COMM_SHADOW", level, subjects: ["EV1"], raised_seq: 1, acked_seq: null, cleared_seq: null, acked_by: null, message: "Comm shadow", data: {},
  });

  it("at the stop with no alert the full list shows", async () => {
    const { container } = await open(atStop());
    expect(container.querySelector('[data-testid="stop-task-list"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="tasks-collapsed-count"]')).toBeNull();
  });

  it("while walking only the count shows", async () => {
    const { container } = await open(atStop({ activity: "WALKING" }));
    expect(container.querySelector('[data-testid="stop-task-list"]')).toBeNull();
    expect(must(container, '[data-testid="tasks-collapsed-count"]').textContent).toContain("TASKS 0/1");
  });

  it.each(["warning", "caution"] as const)("during a %s alert only the count shows", async (level) => {
    const { container } = await open({ ...atStop(), alerts: [alert(level)] });
    expect(container.querySelector('[data-testid="stop-task-list"]')).toBeNull();
    expect(container.querySelector('[data-testid="tasks-collapsed-count"]')).not.toBeNull();
  });

  it("a cleared alert no longer collapses it", async () => {
    const { container } = await open({ ...atStop(), alerts: [{ ...alert("warning"), cleared_seq: 9 }] });
    expect(container.querySelector('[data-testid="stop-task-list"]')).not.toBeNull();
  });
});

describe("crewId is required: nothing defaults to EV1 (T24.04)", () => {
  it("the props types require it", () => {
    // @ts-expect-error crewId is required on every EVA screen
    const tablet: EvaTabletProps = { snapshot: null };
    // @ts-expect-error crewId is required
    const hud: HudProps = { snapshot: null };
    // @ts-expect-error crewId is required
    const lost: HabLinkLostProps = { snapshot: null };
    // @ts-expect-error crewId is required for the EVA options sheet
    const options: OptionsProps = { variant: "eva", snapshot: null };
    const ops: OptionsProps = { variant: "ops", snapshot: null };
    expect([tablet, hud, lost, options, ops]).toHaveLength(5);
  });

  it("without a crewId at run time the screens show — and unknown, not EV1's telemetry, and cannot act", async () => {
    const snapshot = atStop();
    const { client, sent } = recordingClient(storeFromBeat("connect"));
    const noCrew = { client, snapshot } as unknown as EvaTabletProps;

    const tablet = await mount(createElement(EvaTablet, noCrew));
    expect(valueText(tablet.container, "haven")).toBe("—");
    expect(valueText(tablet.container, "o2")).toBe("—");
    expect(must<HTMLButtonElement>(tablet.container, "#action-summon-rover").disabled).toBe(true);
    expect(must<HTMLButtonElement>(tablet.container, "#action-abort-hab").disabled).toBe(true);
    await click(must(tablet.container, '[data-testid="tasks-button"]'));
    expect(must(tablet.container, '[data-slot="stop-task-list"]').querySelectorAll("button")).toHaveLength(0);
    await tablet.unmount();

    const hud = await mount(createElement(Hud, { snapshot } as unknown as HudProps));
    expect(valueText(hud.container, "hud-haven")).toBe("—");
    await hud.unmount();

    const lost = await mount(createElement(HabLinkLost, { snapshot } as unknown as HabLinkLostProps));
    expect(must(lost.container, '[data-slot="cached-telemetry"] .value').textContent).toBe("—");
    expect(sent).toHaveLength(0);
  });
});

describe("SCR-12 banner and surface", () => {
  it("the banner reads UNKNOWN when HAVEN is unknown even though O₂ is known", async () => {
    const s = atStop();
    const snapshot: Snapshot = { ...s, alerts: [], crew: s.crew.map((c) => ({ ...c, haven: { ...c.haven, minutes: Number.NaN } })) };
    const { container } = await mount(createElement(EvaTablet, { snapshot, crewId: "EV1" }));

    expect(valueText(container, "o2")).toBe("71");
    expect(must(container, '[data-slot="alert-nominal"]').textContent).toContain("UNKNOWN");
    expect(must(container, '[data-slot="alert-nominal"]').textContent).not.toContain("NOMINAL");
  });

  it("the banner reads UNKNOWN when O₂ is unknown even though HAVEN is known", async () => {
    const s = atStop();
    const snapshot: Snapshot = { ...s, alerts: [], crew: s.crew.map((c) => ({ ...c, o2_frac: Number.NaN })) };
    const { container } = await mount(createElement(EvaTablet, { snapshot, crewId: "EV1" }));

    expect(must(container, '[data-slot="alert-nominal"]').textContent).toContain("UNKNOWN");
  });

  it("the banner reads NOMINAL only when both are known and no alert is open", async () => {
    const { container } = await mount(createElement(EvaTablet, { snapshot: { ...atStop(), alerts: [] }, crewId: "EV1" }));
    expect(must(container, '[data-slot="alert-nominal"]').textContent).toContain("NOMINAL");
  });

  it("the root declares data-surface=eva so the 56 px target rule of base.css applies", async () => {
    const { container } = await mount(createElement(EvaTablet, { snapshot: atStop(), crewId: "EV1" }));
    expect(must(container, '[data-screen="SCR-12"]').getAttribute("data-surface")).toBe("eva");
  });
});
