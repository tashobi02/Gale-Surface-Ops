/**
 * T07.03 / T24.04 / T25.06 — the role routes' own behaviour (docs/specs/03 SCR-10, SCR-12, SCR-13, SCR-14; 04 §E.6):
 * the HUD's 2 s hold back to the tablet, the tablet's options sheet and HUD button, and the join screen's Hab Core
 * status and QR role. Real screens, real client store; fetch and timers are controlled.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import type { ServerMessage, Snapshot } from "@marswalk/protocol";
import type { SocketLike } from "../../src/net/habClient";
import { closeHabSessions, startHabSession } from "../../src/state/habSession";
import { HUD_EXIT_HOLD_MS, HudRoute } from "../../src/ui/live/HudRoute";
import { EvaRoute } from "../../src/ui/live/EvaRoute";
import { JoinRoute } from "../../src/ui/live/JoinRoute";
import { wsFixtures } from "../fixtures/ws";
import { click, flush, installDom, keyDown, mount, must, pointerDown, pointerUp, removeDom } from "./domHarness";

function openSession(role: "eva:EV1" | "ops", ...messages: ServerMessage[]) {
  const socket = {
    readyState: 1,
    onopen: null as (() => void) | null,
    onmessage: null as ((ev: { data: string }) => void) | null,
    onclose: null as (() => void) | null,
    send() {},
    close() {},
  };
  startHabSession({ role, clientId: "c-1", displayName: role, url: "ws://localhost/ws", socketFactory: () => socket as SocketLike });
  return async (...more: ServerMessage[]) => {
    await act(async () => {
      for (const m of more) socket.onmessage?.({ data: JSON.stringify(m) });
    });
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  closeHabSessions();
  vi.useRealTimers();
  document.body.innerHTML = "";
  window.location.hash = "";
});

describe("HudRoute (SCR-13: exit by tap-and-hold, 2 s)", () => {
  it("holding anywhere for 2 s goes back to the tablet of the same crew member", async () => {
    vi.useFakeTimers();
    const receive = openSession("eva:EV1");
    const { container } = await mount(createElement(HudRoute, { crewId: "EV1" }));
    await receive(...wsFixtures.connect);
    await pointerDown(must(container, '[data-screen="SCR-13"]'));
    await act(async () => {
      vi.advanceTimersByTime(HUD_EXIT_HOLD_MS - 1);
    });
    expect(window.location.hash).toBe("");
    await act(async () => {
      vi.advanceTimersByTime(2);
    });
    expect(window.location.hash).toBe("#/eva/EV1");
  });

  it("releasing early cancels the exit", async () => {
    vi.useFakeTimers();
    const receive = openSession("eva:EV1");
    const { container } = await mount(createElement(HudRoute, { crewId: "EV2" }));
    await receive(...wsFixtures.connect);
    const hud = must(container, '[data-screen="SCR-13"]');
    await pointerDown(hud);
    await act(async () => {
      vi.advanceTimersByTime(HUD_EXIT_HOLD_MS - 500);
    });
    await pointerUp(hud);
    await act(async () => {
      vi.advanceTimersByTime(HUD_EXIT_HOLD_MS);
    });
    expect(window.location.hash).toBe("");
  });

  it("takes focus on mount, so Escape works without a tap first", async () => {
    openSession("eva:EV1");
    const { container } = await mount(createElement(HudRoute, { crewId: "EV1" }));
    expect(document.activeElement).toBe(must(container, '[data-slot="hud-route"]'));
  });

  it("Escape is the keyboard way back", async () => {
    openSession("eva:EV1");
    const { container } = await mount(createElement(HudRoute, { crewId: "EV1" }));
    await keyDown(must(container, '[data-slot="hud-route"]'), "Escape");
    expect(window.location.hash).toBe("#/eva/EV1");
  });

  it("the HUD is still read-only: no buttons", async () => {
    openSession("eva:EV1");
    const { container } = await mount(createElement(HudRoute, { crewId: "EV1" }));
    expect(container.querySelectorAll("button").length).toBe(0);
  });
});

describe("EvaRoute (SCR-12 with its HUD button and SCR-14 sheet)", () => {
  it("the HUD button opens #/hud/<crew>", async () => {
    const receive = openSession("eva:EV1");
    const { container } = await mount(createElement(EvaRoute, { crewId: "EV1" }));
    await receive(...wsFixtures.connect);
    await click(must(container, "#action-open-hud"));
    expect(window.location.hash).toBe("#/hud/EV1");
  });

  it("the alert's OPTIONS button opens the SCR-14 sheet for this crew member, and it can be closed", async () => {
    const receive = openSession("eva:EV1");
    const { container } = await mount(createElement(EvaRoute, { crewId: "EV1" }));
    const base = wsFixtures.connect[0] as Snapshot;
    await receive({
      ...base,
      alerts: [
        { alert_id: "a-1", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1"], raised_seq: 5, acked_seq: null, cleared_seq: null, acked_by: null, message: "Shelter now", data: {} },
      ],
    });
    expect(container.querySelector('[data-screen="SCR-14"]')).toBeNull();
    await click(must(container, 'button[aria-label="Review alert options"]'));
    const sheet = must(container, '[data-screen="SCR-14"]');
    expect(sheet.getAttribute("data-variant")).toBe("eva");
    await click(must(sheet, 'button[aria-label="Close options sheet"]'));
    expect(container.querySelector('[data-screen="SCR-14"]')).toBeNull();
  });
});

describe("JoinRoute (SCR-10)", () => {
  const session = (clients: Array<{ client_id: string; role: string; display_name: string }>) => ({
    ...wsFixtures.connect[0],
    clients,
  });

  it("connecting until the Hab Core answers, then ready with the scenario and the roles already taken", async () => {
    let answer!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (answer = r)));
    const { container } = await mount(createElement(JoinRoute, { fetchImpl, pollMs: 60_000 }));
    expect(must(container, '[data-slot="join-status"]').getAttribute("data-status")).toBe("connecting");

    await act(async () => {
      answer(json(session([{ client_id: "c-9", role: "eva:EV1", display_name: "EV1 tablet" }])));
    });
    await flush();
    expect(must(container, '[data-slot="join-status"]').getAttribute("data-status")).toBe("ready");
    expect(must(container, '[data-slot="join-scenario"]').textContent).toBe("storm-sol4190");
    expect(container.querySelectorAll(".role-taken").length).toBe(1);
    expect(fetchImpl).toHaveBeenCalledWith("api/session");
  });

  it("no session loaded (404) still means the Hab Core is reachable; the scenario stays —", async () => {
    const fetchImpl = vi.fn(async () => json({ error: "no session loaded" }, 404));
    const { container } = await mount(createElement(JoinRoute, { fetchImpl, pollMs: 60_000 }));
    await flush();
    expect(must(container, '[data-slot="join-status"]').getAttribute("data-status")).toBe("ready");
    expect(must(container, '[data-slot="join-scenario"]').textContent).toBe("—");
  });

  it("unreachable on a network error, and it keeps polling so it recovers", async () => {
    vi.useFakeTimers();
    let up = false;
    const fetchImpl = vi.fn(async () => {
      if (!up) throw new TypeError("Failed to fetch");
      return json(session([]));
    });
    const { container } = await mount(createElement(JoinRoute, { fetchImpl, pollMs: 3000 }));
    await flush();
    expect(must(container, '[data-slot="join-status"]').getAttribute("data-status")).toBe("unreachable");
    up = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(must(container, '[data-slot="join-status"]').getAttribute("data-status")).toBe("ready");
  });

  it("this tab's own open connection is not shown as a role taken by someone else", async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        session([
          { client_id: "c-me", role: "ops", display_name: "Ops console" },
          { client_id: "c-9", role: "eva:EV1", display_name: "EV1 tablet" },
        ]),
      ),
    );
    const { container } = await mount(createElement(JoinRoute, { fetchImpl, pollMs: 60_000, ownClientId: "c-me" }));
    await flush();
    const taken = [...container.querySelectorAll(".role-taken")];
    expect(taken).toHaveLength(1);
    expect(taken[0].textContent).toContain("[EV1]");
  });

  it("a tile goes to its role's route", async () => {
    const fetchImpl = vi.fn(async () => json(session([])));
    const { container } = await mount(createElement(JoinRoute, { fetchImpl, pollMs: 60_000 }));
    await flush();
    const tiles = [...container.querySelectorAll("article")];
    const ops = tiles.find((t) => t.textContent?.includes("[OPS]"));
    await click(must(ops as HTMLElement, "button"));
    expect(window.location.hash).toBe("#/ops");
  });

  it("a QR link (#/join?role=eva:EV2) goes straight to that role when it is free", async () => {
    const fetchImpl = vi.fn(async () => json(session([])));
    await mount(createElement(JoinRoute, { fetchImpl, pollMs: 60_000, joinRole: "eva:EV2" }));
    await flush();
    expect(window.location.hash).toBe("#/eva/EV2");
  });

  it("a QR link for a role that is taken stays on the join screen, so the take-over question is asked", async () => {
    const fetchImpl = vi.fn(async () => json(session([{ client_id: "c-9", role: "eva:EV2", display_name: "EV2 tablet" }])));
    const { container } = await mount(createElement(JoinRoute, { fetchImpl, pollMs: 60_000, joinRole: "eva:EV2" }));
    await flush();
    expect(window.location.hash).toBe("");
    expect(container.querySelectorAll(".role-taken").length).toBe(1);
  });

  it("a taken role offers a real take-over: an honest confirm that the other device will be disconnected (02 §E.4)", async () => {
    const fetchImpl = vi.fn(async () => json(session([{ client_id: "c-9", role: "eva:EV1", display_name: "EV1 tablet" }])));
    const { container } = await mount(createElement(JoinRoute, { fetchImpl, pollMs: 60_000 }));
    await flush();
    const taken = must(container, ".role-taken");
    expect(must(taken, "button").textContent).toContain("TAKE OVER");
    expect(window.location.hash).toBe("");
    await click(must(taken, "button"));
    // Nothing happens until it is confirmed: the question comes first.
    expect(window.location.hash).toBe("");
    expect(taken.textContent).toMatch(/the other device will be disconnected/i);
    expect(taken.textContent).not.toMatch(/not built|stay connected|stays connected/i);
    const confirm = must(taken, 'button[aria-label^="Confirm"]');
    expect(confirm.textContent).toContain("TAKE OVER");
    expect(confirm.textContent).toContain("DISCONNECTS THE OTHER DEVICE");
    await click(confirm);
    expect(window.location.hash).toBe("#/eva/EV1");
  });

  it("cancelling the take-over question leaves everything as it was", async () => {
    const fetchImpl = vi.fn(async () => json(session([{ client_id: "c-9", role: "ops", display_name: "Ops console" }])));
    const { container } = await mount(createElement(JoinRoute, { fetchImpl, pollMs: 60_000 }));
    await flush();
    const taken = must(container, ".role-taken");
    await click(must(taken, "button"));
    await click(must(taken, 'button[aria-label="Cancel"]'));
    expect(window.location.hash).toBe("");
    expect(taken.textContent).not.toMatch(/will be disconnected/i);
  });
});
