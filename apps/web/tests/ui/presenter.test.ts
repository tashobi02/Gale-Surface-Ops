/** T32.19 / T32.20: SCR-19 commands use the real client contract and F7 session. */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { readFileSync } from "node:fs";
import type { CommandResult, Snapshot } from "@marswalk/protocol";
import type { HabClient, SocketLike } from "../../src/net/habClient";
import { closeHabSessions, startHabSession } from "../../src/state/habSession";
import { wsFixtures } from "../fixtures/ws";
import { accepted, recordingClient, rejected, storeFromBeat } from "./fixtureStore";
import { click, flush, installDom, mount, must, removeDom, type Mounted } from "./domHarness";

const loaded = wsFixtures["live-loaded"][0] as Snapshot;
const running: Snapshot = { ...loaded, next_stop_target: { stop_id: "wp-2", stop_index: 1 }, session: { ...loaded.session, status: "RUNNING" } };
const clients: HabClient[] = [];
const mounted: Mounted[] = [];
beforeAll(installDom);
afterAll(removeDom);
afterEach(async () => { for (const m of mounted.splice(0)) await m.unmount(); for (const c of clients.splice(0)) c.close(); closeHabSessions(); });

async function panel(snapshot: Snapshot | null = running, answer: () => CommandResult | Promise<CommandResult> = accepted) {
  const real = storeFromBeat("live-loaded"); clients.push(real);
  const { client, sent } = recordingClient({ ...real, role: "presenter", state: () => snapshot }, answer);
  const { Presenter } = await import("../../src/ui/screens/scr19Presenter");
  const m = await mount(createElement(Presenter, { client })); mounted.push(m);
  return { ...m, sent, client };
}
const button = (root: ParentNode, name: string) => must<HTMLButtonElement>(root, `button[aria-label="${name}"]`);

describe("SCR-19 presenter", () => {
  it("sends every primary command, confirms reset and never applies state locally", async () => {
    const { container, sent } = await panel();
    await click(button(container, "Next stop"));
    await click(button(container, "Start storm"));
    for (const speed of [1, 10, 60]) await click(button(container, `Set speed to ${speed}x`));
    await click(button(container, "Pause mission clock"));
    await click(button(container, "Reset session"));
    expect(sent).toHaveLength(6);
    await click(button(container, "Confirm reset session"));
    expect(sent).toEqual([
      { kind: "JUMP_NEXT_STOP", args: {} }, { kind: "START_EVENT", args: { event_id: "storm" } },
      ...[1, 10, 60].map((speed) => ({ kind: "SET_CLOCK", args: { speed } })),
      { kind: "SET_CLOCK", args: { paused: true } }, { kind: "RESET_SESSION", args: {} },
    ]);
    expect(button(container, "Set speed to 1x").getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("Stop 1");
    expect(container.textContent).toContain("Accepted");
  });

  it("shows advancing with the server target and sim time until COMMAND_RESULT; refuses duplicate clicks", async () => {
    let resolve!: (r: CommandResult) => void;
    const { container, sent } = await panel(running, () => new Promise((r) => { resolve = r; }));
    await click(button(container, "Next stop"));
    expect(container.textContent).toContain("Advancing to stop 1");
    expect(must(container, ".presenter-beats [role=status]").textContent).toContain(running.session.clock.sim_time);
    expect(button(container, "Next stop").disabled).toBe(true);
    await click(button(container, "Next stop")); expect(sent).toHaveLength(1);
    await act(async () => resolve(accepted()));
    expect(button(container, "Next stop").disabled).toBe(false);
    expect(container.textContent).not.toContain("Advancing to stop");
  });

  it("shows BUSY, INVALID and FORBIDDEN_ROLE reasons in last results", async () => {
    for (const code of ["BUSY", "INVALID", "FORBIDDEN_ROLE"] as const) {
      const { container } = await panel(running, () => rejected(code, "Server refusal"));
      await click(button(container, "Next stop"));
      expect(must(container, '[aria-label="Last command results"]').textContent).toContain(`${code}: Server refusal`);
    }
  });

  it("has neutral controls, no crew actions and explicit simulated clock provenance", async () => {
    const { container } = await panel();
    expect(container.textContent).not.toMatch(/Approve|Abort|Summon|O₂|dose_event/);
    expect(must(container, '[data-source="snapshot:session.clock.sim_time"]').getAttribute("data-provenance")).toBe("simulated");
    expect(container.textContent).toContain("simulated");
  });

  it("uses no status colour on any presenter control: every button is a neutral token", async () => {
    const { container } = await panel();
    // The status tokens (04 §C.1) are the colours a status may use; a presenter control uses none of them, so the
    // computed background and border colours are the neutral surfaces only. The primitives are read from tokens.css, so a
    // retuned status colour is still caught.
    const tokens = readFileSync(new URL("../../src/ui/styles/tokens.css", import.meta.url), "utf8");
    const statusPrimitives = ["--nominal", "--caution", "--warning", "--advisory", "--unknown", "--signal", "--signal-ink"];
    const resolved = new Set(statusPrimitives
      .map((primitive) => new RegExp(`${primitive}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)?.[1]?.toUpperCase())
      .filter((hex): hex is string => !!hex));
    expect(resolved.size).toBe(statusPrimitives.length);
    for (const el of container.querySelectorAll("button")) {
      const style = getComputedStyle(el);
      for (const prop of ["backgroundColor", "borderTopColor", "color"] as const) {
        expect(resolved.has(style[prop].trim().toUpperCase()), `${el.getAttribute("aria-label")} ${prop}=${style[prop]}`).toBe(false);
      }
    }
  });

  it("follows a new session id with a fresh panel", async () => {
    const { container } = await panel(running);
    expect(must(container, ".presenter-session").textContent).toContain(running.session.scenario_id);
    // A new session id re-keys the panel, so the new session's own status decides the controls.
    const next = { ...running, seq: 2, session: { ...running.session, session_id: "s-0008", status: "LOADED" as const } };
    const { container: after } = await panel(next);
    expect(must(after, ".presenter-session").textContent).toContain("LOADED");
    expect(must(after, '.presenter-actions button[aria-label="Load scenario"]')).not.toBeNull();
  });

  it("marks missing session values and failed QR images unavailable", async () => {
    const { container } = await panel(null);
    const missing = must(container, '[data-source="unavailable:session.scenario_id"]');
    expect(missing.getAttribute("data-unavailable")).toBe("true");
    expect(missing.getAttribute("data-provenance")).not.toBe("assumed");
    const qr = must<HTMLImageElement>(container, "img");
    expect(qr.getAttribute("data-source")).toContain("api/join-qr");
    await act(async () => qr.dispatchEvent(new window.Event("error")));
    expect(must(container, '[data-source="unavailable:api/join-qr"]').getAttribute("data-unavailable")).toBe("true");
  });

  it("moves focus into reset confirmation and restores it on Escape", async () => {
    const { container } = await panel();
    const reset = button(container, "Reset session");
    reset.focus(); await click(reset);
    expect(document.activeElement).toBe(button(container, "Confirm reset session"));
    await act(async () => document.activeElement?.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.activeElement).toBe(reset);
  });

  it("describes the jump destination to screen readers", async () => {
    const { container } = await panel();
    const description = button(container, "Next stop").getAttribute("aria-describedby");
    expect(description).toBeTruthy();
    expect(must(container, `#${description}`).textContent).toContain("Stop 1 · wp-2");
  });

  it.each(["lost", "taken"] as const)("disables commands on %s notifications with an unchanged snapshot", async (change) => {
    const real = storeFromBeat("live-loaded"); clients.push(real);
    const listeners = new Set<() => void>(); let lost = false; let taken = false;
    const { client, sent } = recordingClient({ ...real, role: "presenter", state: () => running,
      linkLost: () => ({ lost, since_ms: null }), takenOver: () => taken,
      subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    });
    const { Presenter } = await import("../../src/ui/screens/scr19Presenter");
    const m = await mount(createElement(Presenter, { client })); mounted.push(m);
    await act(async () => { if (change === "lost") lost = true; else taken = true; for (const l of listeners) l(); });
    expect(button(m.container, "Next stop").disabled).toBe(true);
    await click(button(m.container, "Next stop")); expect(sent).toEqual([]);
  });

  it("renders no session, loaded, running, storm running, paused and ended, and local join QR codes", async () => {
    for (const status of [null, "LOADED", "RUNNING", "PAUSED", "ENDED"] as const) {
      const snapshot = status === null ? null : { ...running, session: { ...running.session, status, clock: { ...running.session.clock, paused: status === "PAUSED" } } };
      const { container } = await panel(snapshot);
      expect(container.textContent).toContain(status ?? "Not connected");
      expect(container.querySelectorAll('img[src^="api/join-qr?role="]').length).toBeGreaterThan(0);
      if (status === null || status === "ENDED") expect(button(container, "Next stop").disabled).toBe(true);
    }
    const { container } = await panel({ ...running, session: { ...running.session, started_events: [{ event_id: "storm", t0_sim_time: running.sim_time }] } });
    expect(container.textContent).toContain("Storm running");
    expect(button(container, "Start storm").disabled).toBe(true);
  });

  it("offers Load scenario only loaded/ended, and Jump next event only running/paused", async () => {
    for (const status of ["LOADED", "RUNNING", "PAUSED", "ENDED"] as const) {
      const { container, sent } = await panel({ ...running, session: { ...running.session, status } });
      const load = container.querySelector<HTMLButtonElement>('.presenter-actions button[aria-label="Load scenario"]');
      const jump = container.querySelector<HTMLButtonElement>('.presenter-actions button[aria-label="Jump to next event"]');
      expect(!!load).toBe(status === "LOADED" || status === "ENDED");
      expect(!!jump).toBe(status === "RUNNING" || status === "PAUSED");
      if (load) { await click(load); expect(sent).toContainEqual({ kind: "LOAD_SCENARIO", args: { scenario_id: loaded.session.scenario_id } }); }
      if (jump) { await click(jump); expect(sent).toContainEqual({ kind: "JUMP_NEXT_EVENT", args: {} }); }
      expect(container.querySelector('[aria-label="Start EVA mission"]')).toBeNull();
    }
  });

  it("reads the current presenter connection without a prop and follows fresh snapshots", async () => {
    const socket: SocketLike = { readyState: 1, onopen: null, onmessage: null, onclose: null, send() {}, close() {} };
    startHabSession({ role: "presenter", clientId: "c-presenter", displayName: "Presenter", url: "ws://localhost/ws", socketFactory: () => socket });
    const { Presenter } = await import("../../src/ui/screens/scr19Presenter");
    const m = await mount(createElement(Presenter)); mounted.push(m);
    expect(m.container.textContent).toContain("Not connected");
    await act(async () => socket.onmessage?.({ data: JSON.stringify(loaded) })); await flush();
    expect(m.container.textContent).toContain(loaded.session.scenario_id);
    await act(async () => socket.onmessage?.({ data: JSON.stringify({ ...loaded, seq: 2, session: { ...loaded.session, status: "ENDED" } }) }));
    expect(m.container.textContent).toContain("ENDED");
  });
});
