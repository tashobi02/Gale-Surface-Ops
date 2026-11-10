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
import { accepted, recordingClient, rejected, storeFromBeat } from "./fixtureStore";
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

describe("stop task changes are sent at once; UNDO reverses them on the server for 5 s (FR-50)", () => {
  const TASK_ID = "t-s2-02";
  const unlinked = (): Snapshot => {
    const s = atStop();
    return { ...s, crew: s.crew.map((c) => ({ ...c, linked: false })) };
  };
  const withTaskState = (snapshot: Snapshot, state: Snapshot["tasks"][number]["state"]): Snapshot => ({
    ...snapshot,
    tasks: snapshot.tasks.map((t) => (t.task_id === TASK_ID ? { ...t, state } : t)),
  });

  async function tablet(answer?: Parameters<typeof recordingClient>[1], snapshot: Snapshot = atStop()) {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect"), answer);
    const element = (snap: Snapshot) => createElement(EvaTablet, { client, crewId: "EV1", snapshot: snap });
    const view = await mount(element(snapshot));
    await click(must(view.container, '[data-testid="tasks-button"]'));
    return { ...view, sent, show: (snap: Snapshot) => view.rerender(element(snap)) };
  }
  const tick = (c: HTMLElement) => click(must(c, '[aria-label^="Mark task done: Image"]'));
  const undoButton = (c: HTMLElement) => c.querySelector('[aria-label^="Undo task change: Image"]');
  const advance = async (ms: number) => {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
    await flush();
  };
  const row = (c: HTMLElement) => must(c, `[data-testid="task-row-${TASK_ID}"]`);
  const rowState = (c: HTMLElement) => row(c).getAttribute("data-state");
  const DONE = { kind: "UPDATE_STOP_TASK", args: { task_id: TASK_ID, state: "DONE" } };
  const UNDO = { kind: "UPDATE_STOP_TASK", args: { task_id: TASK_ID, state: "TODO", undo: true } };

  it("the undo window is the 5 s of 01 FR-50", () => {
    expect(STOP_TASK_UNDO_WINDOW_MS).toBe(5000);
  });

  it("a tick sends DONE at once and shows DONE with UNDO; nothing waits on the client", async () => {
    const { container, sent } = await tablet();
    await tick(container);

    expect(sent).toEqual([DONE]);
    expect(rowState(container)).toBe("DONE");
    expect(undoButton(container)).not.toBeNull();
  });

  it("the row keeps showing the change after it was accepted, until the snapshot shows the new state", async () => {
    const { container, show } = await tablet();
    await tick(container);
    await advance(100);
    expect(rowState(container)).toBe("DONE"); // accepted, snapshot not yet changed

    await show(withTaskState(atStop(), "DONE")); // the STATE_DELTA arrived
    expect(rowState(container)).toBe("DONE");
    await show(withTaskState(atStop(), "TODO")); // a later snapshot that is TODO again is the server's word, not our overlay
    expect(rowState(container)).toBe("TODO");
  });

  it("UNDO inside the window sends the reversal {state: TODO, undo: true}, and never a TODO without undo", async () => {
    const { container, sent } = await tablet();
    await tick(container);
    await advance(2000);
    await click(must(container, '[aria-label^="Undo task change: Image"]'));

    expect(sent).toEqual([DONE, UNDO]);
    expect(rowState(container)).toBe("TODO");
    expect(undoButton(container)).toBeNull();
    expect(sent.filter((c) => c.args.state === "TODO").every((c) => c.args.undo === true)).toBe(true);
  });

  it("UNDO is offered for 5 s of wall-clock time and then gone", async () => {
    const { container, sent } = await tablet();
    await tick(container);
    await advance(STOP_TASK_UNDO_WINDOW_MS - 1);
    expect(undoButton(container)).not.toBeNull();
    await advance(1);
    expect(undoButton(container)).toBeNull();
    expect(sent).toEqual([DONE]);
  });

  it("SKIP sends the reason-bearing change when the reason is chosen; UNDO then reverses it", async () => {
    const { container, sent } = await tablet();
    await click(must(container, '[aria-label^="Skip task: Image"]'));
    expect(sent).toHaveLength(0);
    await click(must(container, '[aria-label="Reason: terrain"]'));
    expect(sent).toEqual([{ kind: "UPDATE_STOP_TASK", args: { task_id: TASK_ID, state: "SKIPPED", reason: "terrain" } }]);
    expect(rowState(container)).toBe("SKIPPED");
    await click(must(container, '[aria-label^="Undo task change: Image"]'));
    expect(sent[1]).toEqual(UNDO);
  });

  it("a rejected tick goes back to the server's state and shows the Hab Core's reason, not 'not synced'", async () => {
    const { container } = await tablet(() => rejected("INVALID", "illegal task transition"));
    await tick(container);
    await advance(0);

    expect(rowState(container)).toBe("TODO");
    expect(must(container, `[data-testid="task-row-${TASK_ID}"] [data-field="rejection"]`).textContent).toContain("INVALID: illegal task transition");
    expect(container.querySelector(".tag-sync")).toBeNull();
    expect(container.textContent).not.toContain("not synced");
  });

  it("a rejected UNDO (FORBIDDEN_ROLE, or INVALID after a change) leaves the row as the server has it, with the reason", async () => {
    for (const [code, message] of [["FORBIDDEN_ROLE", "not the actor of the last change"], ["INVALID", "the task changed since"]] as const) {
      const { container, sent, show, unmount } = await tablet((c) => (c.args.undo ? rejected(code, message) : accepted()));
      await tick(container);
      await show(withTaskState(atStop(), "DONE")); // our tick landed
      await click(must(container, '[aria-label^="Undo task change: Image"]'));
      await advance(0);

      expect(sent[1]).toEqual(UNDO);
      expect(rowState(container)).toBe("DONE");
      expect(must(container, '[data-field="rejection"]').textContent).toContain(`${code}: ${message}`);
      expect(container.textContent).not.toContain("not synced");
      await unmount();
    }
  });

  it("a rejection clears once the server's state of the task changes", async () => {
    const { container, show } = await tablet(() => rejected("INVALID", "no"));
    await tick(container);
    await advance(0);
    expect(container.querySelector('[data-field="rejection"]')).not.toBeNull();

    await show(withTaskState(atStop(), "DROPPED")); // e.g. a plan revision
    expect(container.querySelector('[data-field="rejection"]')).toBeNull();
  });

  it("a change whose task the server moved on for another reason (DROPPED) is not overlaid any more", async () => {
    const { container, show } = await tablet();
    await tick(container);
    expect(rowState(container)).toBe("DONE");

    await show(withTaskState(atStop(), "DROPPED"));
    expect(rowState(container)).toBe("DROPPED");
  });

  it("while the link is down a tick waits on the client and reads 'not synced'; UNDO inside the window sends neither command", async () => {
    const { container, sent } = await tablet(undefined, unlinked());
    await tick(container);

    expect(sent).toHaveLength(0);
    expect(must(container, `[data-testid="task-row-${TASK_ID}"] .tag-sync`).textContent).toBe("not synced");
    await click(must(container, '[aria-label^="Undo task change: Image"]'));
    await advance(STOP_TASK_UNDO_WINDOW_MS * 2);

    expect(sent).toHaveLength(0);
    expect(rowState(container)).toBe("TODO");
  });

  it("while the link is down and no UNDO comes, the tick goes to the queue when the window ends", async () => {
    const never = new Promise<never>(() => {});
    const { container, sent } = await tablet(() => never, unlinked());
    await tick(container);
    await advance(STOP_TASK_UNDO_WINDOW_MS - 1);
    expect(sent).toHaveLength(0);
    await advance(1);

    expect(sent).toEqual([DONE]);
    expect(rowState(container)).toBe("DONE");
    expect(must(container, `[data-testid="task-row-${TASK_ID}"] .tag-sync`).textContent).toBe("not synced");
  });

  it("while the link is down a newer change sends the older waiting one first, so the queue keeps its order", async () => {
    const snap = unlinked();
    const second = { ...snap.tasks[0], task_id: "t-s2-03", text: "Sample the vein" };
    const { container, sent } = await tablet(undefined, { ...snap, tasks: [...snap.tasks, second] });
    await tick(container);
    await click(must(container, '[aria-label^="Mark task done: Sample"]'));

    expect(sent).toEqual([DONE]);
    await advance(STOP_TASK_UNDO_WINDOW_MS);
    expect(sent.map((c) => c.args.task_id)).toEqual([TASK_ID, "t-s2-03"]);
  });

  it("leaving the screen sends nothing more when everything already went out", async () => {
    const { container, sent, unmount } = await tablet();
    await tick(container);
    await unmount();
    expect(sent).toEqual([DONE]);
  });

  it("leaving the screen with a change waiting (link down) sends it rather than dropping it", async () => {
    const { container, sent, unmount } = await tablet(undefined, unlinked());
    await tick(container);
    expect(sent).toHaveLength(0);
    await unmount();
    expect(sent).toEqual([DONE]);
  });

  it("the TASKS count follows the change at once", async () => {
    const { container } = await tablet();
    expect(must(container, '[data-testid="tasks-button"]').textContent).toContain("0/1");
    await tick(container);
    expect(must(container, '[data-testid="tasks-button"]').textContent).toContain("1/1");
  });

  it.todo("server side (T31.04): UPDATE_STOP_TASK {state: TODO, undo: true} is accepted by the actor of the last change, rejected INVALID after a later change or a PLAN_REVISED, FORBIDDEN_ROLE for another sender, and logged as TASK_UPDATED with data.undo true");
});

describe("the task list is full only at the stop and collapses to its count otherwise (FR-50, 04 §E.5; U-59)", () => {
  async function open(snapshot: Snapshot) {
    const { client } = recordingClient(storeFromBeat("connect"));
    const view = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot }));
    await click(must(view.container, '[data-testid="tasks-button"]'));
    return view;
  }
  const alert = (level: "warning" | "caution" | "advisory", acked_seq: number | null = null): Snapshot["alerts"][number] => ({
    alert_id: "a-1", code: "COMM_SHADOW", level, subjects: ["EV1"], raised_seq: 1, acked_seq, cleared_seq: null, acked_by: null, message: "Comm shadow", data: {},
  });
  const full = (c: HTMLElement) => c.querySelector('[data-testid="stop-task-list"]') !== null;

  it("at the stop with no alert the full list shows", async () => {
    const { container } = await open(atStop());
    expect(full(container)).toBe(true);
    expect(container.querySelector('[data-testid="tasks-collapsed-count"]')).toBeNull();
  });

  it.each(["WALKING", "TO_HAVEN", "SHELTERED", "IN_HAB"] as const)("while %s only the count shows", async (activity) => {
    const { container } = await open(atStop({ activity }));
    expect(full(container)).toBe(false);
    expect(must(container, '[data-testid="tasks-collapsed-count"]').textContent).toContain("TASKS 0/1");
  });

  it("a crew member who is not in the snapshot gets the count only", async () => {
    const { container } = await open({ ...atStop(), crew: [] });
    expect(full(container)).toBe(false);
  });

  it.each(["warning", "caution"] as const)("during an unacknowledged %s alert only the count shows", async (level) => {
    const { container } = await open({ ...atStop(), alerts: [alert(level)] });
    expect(full(container)).toBe(false);
    expect(container.querySelector('[data-testid="tasks-collapsed-count"]')).not.toBeNull();
  });

  it("an acknowledged alert, an advisory and a cleared alert do not collapse it", async () => {
    for (const alerts of [[alert("warning", 5)], [alert("advisory")], [{ ...alert("warning"), cleared_seq: 9 }]]) {
      const { container, unmount } = await open({ ...atStop(), alerts });
      expect(full(container)).toBe(true);
      await unmount();
    }
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
