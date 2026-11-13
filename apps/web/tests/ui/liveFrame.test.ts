/**
 * T24.07 / T07.03 — SCR-18 overlay on the live hosts (docs/specs/03 SCR-18; 04 §E.5; 01 FR-16, FR-32, NFR-13).
 * The overlay appears when the tab's own connection loses the server heartbeat, on the ops, EVA and HUD hosts, with
 * the data-surface of the host so the 12 / 16 px code sizes of tokens.css (04 §C.2) apply. The underlying screen stays
 * mounted (its last values are never blanked). Real client, fake socket, fake timers.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { LINK_LOST_AFTER_MS, type ClientMessage, type ServerMessage, type Snapshot } from "@marswalk/protocol";
import type { SocketLike } from "../../src/net/habClient";
import { closeHabSessions, startHabSession } from "../../src/state/habSession";
import { LiveFrame } from "../../src/ui/live/LiveFrame";
import { HabLinkLost } from "../../src/ui/screens/scr18HabLinkLost";
import { wsFixtures } from "../fixtures/ws";
import { installDom, mount, must, removeDom } from "./domHarness";

class FakeSocket implements SocketLike {
  readyState = 1;
  sent: ClientMessage[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close(): void {
    this.readyState = 3;
  }
  async receive(...messages: ServerMessage[]): Promise<void> {
    await act(async () => {
      for (const m of messages) this.onmessage?.({ data: JSON.stringify(m) });
    });
  }
}

function open(role: "ops" | "eva:EV1") {
  const made: FakeSocket[] = [];
  startHabSession({
    role,
    clientId: "c-1",
    displayName: role,
    url: "ws://localhost/ws",
    socketFactory: () => {
      const s = new FakeSocket();
      made.push(s);
      return s;
    },
  });
  return made;
}

async function silence(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

const child = () => createElement("div", { id: "screen", "data-surface": "x" }, "screen");

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  closeHabSessions();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("LiveFrame", () => {
  it("shows no overlay while the link is up, and the screen is there", async () => {
    vi.useFakeTimers();
    const made = open("eva:EV1");
    const { container } = await mount(createElement(LiveFrame, { variant: "eva", crewId: "EV1" }, child()));
    await made[0].receive(...wsFixtures.connect);
    expect(container.querySelector('[data-slot="link-lost-overlay"]')).toBeNull();
    expect(must(container, "#screen")).toBeTruthy();
  });

  it("EVA host: overlay with the SCR-18 banner and cached values, data-surface eva; the screen stays mounted", async () => {
    vi.useFakeTimers();
    const made = open("eva:EV1");
    const { container } = await mount(createElement(LiveFrame, { variant: "eva", crewId: "EV1" }, child()));
    await made[0].receive(...wsFixtures.connect);
    await silence(LINK_LOST_AFTER_MS + 50);

    const overlay = must(container, '[data-slot="link-lost-overlay"]');
    expect(overlay.getAttribute("data-surface")).toBe("eva");
    expect(must(overlay, '[data-screen="SCR-18"]').textContent).toContain("HAB LINK LOST");
    expect(must(container, "#screen")).toBeTruthy();
  });

  it("HUD host: the same overlay for the crew member, surface eva (16 px codes, never below the HUD's 14)", async () => {
    vi.useFakeTimers();
    const made = open("eva:EV1");
    const { container } = await mount(createElement(LiveFrame, { variant: "hud", crewId: "EV1" }, child()));
    await made[0].receive(...wsFixtures.connect);
    await silence(LINK_LOST_AFTER_MS + 50);
    expect(must(container, '[data-slot="link-lost-overlay"]').getAttribute("data-surface")).toBe("eva");
  });

  it("the link-lost overlay is reachable by keyboard: it scrolls and the EVA notice has no control of its own", async () => {
    // The overlay scrolls on a narrow phone and the EVA notice carries no focusable control, so the scrollable region
    // must itself be focusable (WCAG 2.1.1; axe's `scrollable-region-focusable`).
    vi.useFakeTimers();
    const made = open("eva:EV1");
    const { container } = await mount(createElement(LiveFrame, { variant: "eva", crewId: "EV1" }, child()));
    await made[0].receive(...wsFixtures.connect);
    await silence(LINK_LOST_AFTER_MS + 50);

    const overlay = must(container, '[data-slot="link-lost-overlay"]');
    expect(overlay.getAttribute("tabindex")).toBe("0");
    expect(overlay.getAttribute("role")).toBe("region");
    expect(overlay.getAttribute("aria-label")).toBeTruthy();
    // The EVA notice has no button of its own, so the overlay is the only way in.
    expect(overlay.querySelector("button")).toBeNull();
  });

  it("ops host: a full-screen notice with retry, data-surface ops (12 px codes), not the EVA surface", async () => {
    vi.useFakeTimers();
    const made = open("ops");
    const { container } = await mount(createElement(LiveFrame, { variant: "ops" }, child()));
    await made[0].receive(...wsFixtures.connect);
    await silence(LINK_LOST_AFTER_MS + 50);

    const overlay = must(container, '[data-slot="link-lost-overlay"]');
    expect(overlay.getAttribute("data-surface")).toBe("ops");
    expect(overlay.textContent).toContain("HAB LINK LOST");
    expect(must(overlay, '[data-slot="link-lost-retry"]').textContent).toContain("RETRY");
    expect(overlay.querySelector('[data-surface="eva"]')).toBeNull();
  });

  it("the age counts up from the loss, as a simulated client-side value with its source", async () => {
    vi.useFakeTimers();
    const made = open("eva:EV1");
    const { container } = await mount(createElement(LiveFrame, { variant: "eva", crewId: "EV1" }, child()));
    await made[0].receive(...wsFixtures.connect);
    await silence(LINK_LOST_AFTER_MS + 50);
    await silence(4000);
    const age = must(container, '[data-source="client:link-watchdog"]');
    expect(Number(age.textContent)).toBeGreaterThanOrEqual(4);
    expect(age.getAttribute("data-provenance")).toBe("simulated");
  });

  it("moves focus to the link-loss notice, makes the covered screen inert, and restores focus on reconnect", async () => {
    vi.useFakeTimers();
    const made = open("ops");
    const view = await mount(createElement(LiveFrame, { variant: "ops" }, createElement("button", { id: "under-overlay" }, "Clock")));
    await made[0].receive(...wsFixtures.connect);
    const button = must<HTMLButtonElement>(view.container, "#under-overlay");
    button.focus();
    expect(document.activeElement).toBe(button);
    await silence(LINK_LOST_AFTER_MS + 50);
    const overlay = must(view.container, '[data-slot="link-lost-overlay"]');
    const screen = must(view.container, '[data-slot="live-screen"]');
    expect(screen.hasAttribute("inert")).toBe(true);
    expect(screen.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.contains(document.activeElement)).toBe(true);
    const retry = must<HTMLButtonElement>(overlay, '[data-slot="link-lost-retry"]');
    retry.focus();
    await act(async () => { retry.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); });
    expect(document.activeElement).toBe(overlay);
    await act(async () => { overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })); });
    expect(document.activeElement).toBe(retry);
    await silence(1100);
    await made[made.length - 1].receive(...wsFixtures.walking);
    expect(screen.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(button);
    await view.unmount();
  });

  it("the overlay goes away when the server is heard again", async () => {
    vi.useFakeTimers();
    const made = open("ops");
    const { container } = await mount(createElement(LiveFrame, { variant: "ops" }, child()));
    await made[0].receive(...wsFixtures.connect);
    await silence(LINK_LOST_AFTER_MS + 50);
    await silence(1100);
    await made[made.length - 1].receive(...wsFixtures.walking);
    expect(container.querySelector('[data-slot="link-lost-overlay"]')).toBeNull();
  });
});

describe("taken over by another device (02 §E.4; 03 exception table)", () => {
  const taken = (role: "ops" | "eva:EV1"): ServerMessage => ({ v: 1, type: "TAKEN_OVER", seq: 430, sim_time: "2024-05-20T13:14:00Z", role });

  it("EVA host: a full-screen notice naming the role, in the EVA surface, with a way back to role select", async () => {
    vi.useFakeTimers();
    const made = open("eva:EV1");
    const { container } = await mount(createElement(LiveFrame, { variant: "eva", crewId: "EV1" }, child()));
    await made[0].receive(...wsFixtures.connect, taken("eva:EV1"));

    const notice = must(container, '[data-slot="taken-over-overlay"]');
    expect(notice.getAttribute("data-surface")).toBe("eva");
    expect(notice.textContent).toContain("TAKEN OVER BY ANOTHER DEVICE");
    expect(notice.textContent).toContain("EV1");
    expect(must(notice, '[data-slot="taken-over-back"]').textContent).toContain("BACK TO ROLE SELECT");
  });

  it("ops host: the same notice on the ops surface", async () => {
    vi.useFakeTimers();
    const made = open("ops");
    const { container } = await mount(createElement(LiveFrame, { variant: "ops" }, child()));
    await made[0].receive(...wsFixtures.connect, taken("ops"));
    const notice = must(container, '[data-slot="taken-over-overlay"]');
    expect(notice.getAttribute("data-surface")).toBe("ops");
    expect(notice.textContent).toContain("TAKEN OVER BY ANOTHER DEVICE");
  });

  it("shows no crew values and never offers to reconnect or take the role back by itself", async () => {
    vi.useFakeTimers();
    const made = open("eva:EV1");
    const { container } = await mount(createElement(LiveFrame, { variant: "eva", crewId: "EV1" }, child()));
    await made[0].receive(...wsFixtures.connect, taken("eva:EV1"));
    const notice = must(container, '[data-slot="taken-over-overlay"]');
    expect(notice.querySelector("[data-provenance]")).toBeNull();
    expect([...notice.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["BACK TO ROLE SELECT"]);
  });

  it("no HAB LINK LOST overlay while taken over, however long the silence", async () => {
    vi.useFakeTimers();
    const made = open("ops");
    const { container } = await mount(createElement(LiveFrame, { variant: "ops" }, child()));
    await made[0].receive(...wsFixtures.connect, taken("ops"));
    await silence(LINK_LOST_AFTER_MS * 4);
    expect(container.querySelector('[data-slot="link-lost-overlay"]')).toBeNull();
    expect(container.querySelector('[data-slot="taken-over-overlay"]')).not.toBeNull();
    expect(made).toHaveLength(1);
  });

  it("the screen under the notice is inert and hidden from assistive technology; it is not while the role is held", async () => {
    vi.useFakeTimers();
    const made = open("eva:EV1");
    const { container } = await mount(createElement(LiveFrame, { variant: "eva", crewId: "EV1" }, child()));
    await made[0].receive(...wsFixtures.connect);
    const held = must(container, "#screen").closest('[data-slot="live-screen"]') as HTMLElement;
    expect(held.hasAttribute("inert")).toBe(false);
    expect(held.getAttribute("aria-hidden")).toBeNull();

    await made[0].receive(taken("eva:EV1"));
    const under = must(container, "#screen").closest('[data-slot="live-screen"]') as HTMLElement;
    expect(under.hasAttribute("inert")).toBe(true);
    expect(under.getAttribute("aria-hidden")).toBe("true");
    expect(under.contains(must(container, '[data-slot="taken-over-overlay"]'))).toBe(false); // the notice itself stays operable
  });

  it("the back button goes to the join screen", async () => {
    vi.useFakeTimers();
    const made = open("ops");
    const { container } = await mount(createElement(LiveFrame, { variant: "ops" }, child()));
    await made[0].receive(...wsFixtures.connect, taken("ops"));
    await act(async () => {
      must(container, '[data-slot="taken-over-back"]').dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(globalThis.location.hash).toBe("#/join");
  });
});

describe("SCR-18 data-surface (review of #214)", () => {
  const snapshot = wsFixtures.connect[0] as Snapshot;

  it("the EVA overlay carries data-surface eva itself, wherever it is hosted", async () => {
    const { container } = await mount(createElement(HabLinkLost, { crewId: "EV1", snapshot, client: null }));
    expect(must(container, '[data-screen="SCR-18"]').getAttribute("data-surface")).toBe("eva");
  });

  it("the ops variant carries data-surface ops", async () => {
    const { container } = await mount(createElement(HabLinkLost, { crewId: "EV1", snapshot, client: null, mode: "ops" }));
    expect(must(container, '[data-screen="SCR-18"]').getAttribute("data-surface")).toBe("ops");
  });
});
