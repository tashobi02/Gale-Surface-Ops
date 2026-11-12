/**
 * T24.10 — EVA DOM tests (docs/specs/01 FR-32, FR-33, FR-40, FR-44; 04 §A.3, §D.3, §E.5, §E.6, §E.7).
 * The real components are rendered and driven: snapshots from the fixture store flow into SCR-12/13/18,
 * the hold-to-confirm control is held, released and tapped, and the commands it sends are captured.
 * Static-markup checks stay only for what is static markup (slots, words, classes).
 *
 * Not claimed here: pixel geometry, contrast ratios and glove use (manual checks, see docs/tasks/status.md).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ContingencyOption, Snapshot } from "@marswalk/protocol";
import { EvaTablet } from "../../src/ui/screens/scr12EvaTablet";
import { Hud } from "../../src/ui/screens/scr13Hud";
import { HabLinkLost } from "../../src/ui/screens/scr18HabLinkLost";
import { Options, commandForOption } from "../../src/ui/screens/scr14Options";
import {
  AbortToHabButton,
  HoldToConfirm,
  SummonRoverButton,
  EvaActionRow,
  HOLD_DURATION_MS,
  CONFIRM_FALLBACK_MS,
} from "../../src/ui/eva/HoldToConfirm";
import { BEATS } from "../fixtures/ws";
import { accepted, recordingClient, rejected, storeFromBeat } from "./fixtureStore";
import { click, flush, installDom, keyDown, keyUp, mount, must, pointerDown, pointerUp, removeDom } from "./domHarness";

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../src/ui/styles");

const PROVENANCE = ["measured", "derived", "modelled", "assumed", "replayed", "simulated"];

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function snapshotOf(beat: (typeof BEATS)[number]): Snapshot {
  const state = storeFromBeat(beat).state();
  if (!state) throw new Error(`no snapshot for beat ${beat}`);
  return state;
}

function valueText(root: HTMLElement, slot: string): string {
  return must(root, `[data-slot="${slot}"] .value`).textContent ?? "";
}

describe("SCR-12 EvaTablet on fixture snapshots (04 §A.3, §E.5)", () => {
  it("does not invent link quality bars from the linked flag", async () => {
    const view = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot: snapshotOf("connect") }));
    const strip = must(view.container, '[data-slot="meta-strip"]');
    expect(strip.textContent).not.toMatch(/[▮▯]/);
    expect(strip.textContent).toContain("LINK —");
  });
  it("ack sends ACK_ALERT", async () => {
    const { client, sent } = recordingClient(storeFromBeat("connect"));
    const base = snapshotOf("connect");
    const snapshot: Snapshot = { ...base, alerts: [{
      alert_id: "alert-1", code: "RADIATION_ALERT", level: "warning", subjects: ["EV1"],
      raised_seq: 1, acked_seq: null, cleared_seq: null, acked_by: null,
      message: "Shelter now", data: {},
    }] };
    const view = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot }));
    await click(must(view.container, '[aria-label="Acknowledge alert"]'));
    expect(sent).toEqual([{ kind: "ACK_ALERT", args: { alert_id: "alert-1" } }]);
  });
  it.each([...BEATS])("beat %s: shows the snapshot's own HAVEN and O₂, never NaN, every value labelled", async (beat) => {
    const client = storeFromBeat(beat);
    const snap = client.state()!;
    const ev1 = snap.crew.find((c) => c.crew_id === "EV1")!;
    const { container } = await mount(createElement(EvaTablet, { client, crewId: "EV1" }));

    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
    expect(valueText(container, "haven")).toBe(String(Math.round(ev1.haven.minutes)));
    expect(valueText(container, "o2")).toBe(String(Math.round(ev1.o2_frac * 100)));

    const labelled = container.querySelectorAll("[data-provenance]");
    expect(labelled.length).toBeGreaterThan(0);
    for (const el of labelled) {
      expect(PROVENANCE).toContain(el.getAttribute("data-provenance"));
      expect(el.getAttribute("data-source")).toBeTruthy();
    }
    // The value elements themselves carry the label, not only a neighbouring chip.
    expect(must(container, '[data-slot="haven"] .value').getAttribute("data-provenance")).toBeTruthy();
    expect(must(container, '[data-slot="o2"] .value').getAttribute("data-source")).toBe("snapshot:crew.o2_frac");
  });

  it("different fixture values give different displayed values (the display follows the snapshot)", async () => {
    const connect = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot: snapshotOf("connect") }));
    const connectHaven = valueText(connect.container, "haven");
    await connect.unmount();

    const base = snapshotOf("connect");
    const changed: Snapshot = {
      ...base,
      crew: base.crew.map((c) => (c.crew_id === "EV1" ? { ...c, haven: { ...c.haven, minutes: c.haven.minutes + 7 } } : c)),
    };
    const next = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot: changed }));
    expect(valueText(next.container, "haven")).not.toBe(connectHaven);
    expect(valueText(next.container, "haven")).toBe(String(Math.round(changed.crew[0].haven.minutes)));
  });

  it("without a snapshot nothing is invented: values read —, status is UNKNOWN, no target, no distance", async () => {
    const { container } = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot: null }));

    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
    expect(valueText(container, "haven")).toBe("—");
    expect(valueText(container, "o2")).toBe("—");
    expect(container.textContent).not.toMatch(/via PR1/);
    expect(container.textContent).not.toMatch(/---°|0\.00 km/);
    expect(must(container, '[data-slot="haven"]').textContent).toContain("UNKNOWN");
    expect(must(container, '[data-slot="o2"]').textContent).toContain("UNKNOWN");
    expect(must(container, '[data-slot="alert-nominal"]').textContent).toContain("UNKNOWN");
    // Availability is separate from provenance: the readout is flagged unavailable, keeps the field's own class
    // (05: haven modelled, O₂ simulated) and is never labelled "assumed" (01: a parameter we chose); no glyph beside "—".
    const haven = must(container, '[data-slot="haven"] .value');
    expect(haven.getAttribute("data-unavailable")).toBe("true");
    expect(haven.getAttribute("data-provenance")).toBe("modelled");
    expect(haven.getAttribute("data-source")).toBe("unavailable:crew.haven.minutes");
    const o2 = must(container, '[data-slot="o2"] .value');
    expect(o2.getAttribute("data-unavailable")).toBe("true");
    expect(o2.getAttribute("data-provenance")).toBe("simulated");
    expect(container.innerHTML).not.toContain('data-provenance="assumed"');
    expect(must(container, '[data-slot="haven"]').textContent).not.toMatch(/[■◆○△▶◇]/);
  });

  it("a snapshot with no crew (or without this crew member) shows UNKNOWN on the banner too, not NOMINAL", async () => {
    const base = snapshotOf("connect");
    for (const crew of [[], base.crew.filter((c) => c.crew_id !== "EV1")]) {
      const { container, unmount } = await mount(createElement(EvaTablet, { snapshot: { ...base, crew, alerts: [] }, crewId: "EV1" }));
      const banner = must(container, '[data-slot="alert-nominal"]');
      expect(banner.textContent).toContain("UNKNOWN");
      expect(banner.textContent).not.toContain("NOMINAL");
      expect(must(container, '[data-slot="haven"]').textContent).toContain("UNKNOWN");
      expect(must(container, '[data-slot="o2"]').textContent).toContain("UNKNOWN");
      await unmount();
    }
    // The other crew member's telemetry does not make EV1's banner nominal; EV2's own is unknown here.
    const onlyEv1 = await mount(createElement(EvaTablet, { snapshot: { ...base, alerts: [] }, crewId: "EV2" }));
    expect(must(onlyEv1.container, '[data-slot="alert-nominal"]').textContent).toContain("UNKNOWN");
  });

  it("with this crew member's telemetry and no alert the banner reads NOMINAL", async () => {
    const { container } = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot: { ...snapshotOf("connect"), alerts: [] } }));
    expect(must(container, '[data-slot="alert-nominal"]').textContent).toContain("NOMINAL");
  });

  it("a HAVEN that is the hab reads 'to HAB', not a vehicle id", async () => {
    const base = snapshotOf("connect");
    const hab: Snapshot = {
      ...base,
      crew: base.crew.map((c) => (c.crew_id === "EV1" ? { ...c, haven: { ...c.haven, kind: "hab" as const } } : c)),
    };
    const { container } = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot: hab }));
    expect(must(container, '[data-slot="haven"]').textContent).toContain("to HAB");
    expect(container.textContent).not.toMatch(/via PR1/);
  });

  it("next-stop navigation stays — (the UI computes no geometry) and is labelled", async () => {
    const { container } = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot: snapshotOf("walking") }));
    const next = must(container, '[data-slot="next"]');
    expect(next.textContent).not.toMatch(/NaN/);
    expect(next.textContent).toContain("↗ —");
    for (const el of next.querySelectorAll("[data-provenance]")) {
      expect(el.getAttribute("data-source")).toBeTruthy();
    }
  });

  it("the alert slot, HAVEN, O₂ and the action row keep one DOM order across fixture states (04 §A.3 #4)", async () => {
    const orders: string[] = [];
    for (const beat of ["connect", "walking", "radiation-alert", "summon-accepted", "comm-shadow"] as const) {
      const { container } = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot: snapshotOf(beat) }));
      const slots = [...container.querySelectorAll("[data-slot]")].map((el) => el.getAttribute("data-slot"));
      const pick = (name: string) => slots.indexOf(name);
      expect(pick("alert-slot")).toBeLessThan(pick("haven"));
      expect(pick("haven")).toBeLessThan(pick("o2"));
      expect(pick("o2")).toBeLessThan(pick("action-row"));
      orders.push(["alert-slot", "haven", "o2", "action-row"].map((n) => pick(n)).join(","));
      document.body.innerHTML = "";
    }
    expect(new Set(orders).size).toBe(1);
  });

  it("every status indicator has colour class, shape glyph and word (04 §A.3 #2)", async () => {
    const { container } = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot: snapshotOf("connect") }));
    const indicators = container.querySelectorAll(".status-indicator");
    expect(indicators.length).toBeGreaterThan(0);
    for (const el of indicators) {
      expect(el.className).toMatch(/status-(nominal|caution|warning|unknown|advisory)/);
      expect(el.querySelector(".status-glyph")?.textContent).toBeTruthy();
      expect(el.querySelector(".status-label")?.textContent).toMatch(/NOMINAL|CAUTION|WARNING|UNKNOWN|ADVISORY|STALE/);
    }
  });

  it("EVA hold controls declare the 800 ms hold in the markup (static check)", () => {
    const html = renderToStaticMarkup(createElement(EvaTablet, { crewId: "EV1", snapshot: snapshotOf("connect") }));
    expect(html).toMatch(/SUMMON|Summon/);
    expect(html).toMatch(/Abort/i);
    expect(html).toMatch(/data-hold-duration="800ms"/);
  });
});

describe("SCR-13 HUD and SCR-18 link-lost on fixture snapshots", () => {
  it("HUD shows the snapshot's values with labels, and — with no snapshot (never 000° or 0.00 KM)", async () => {
    const withData = await mount(createElement(Hud, { crewId: "EV1", snapshot: snapshotOf("connect") }));
    expect(withData.container.textContent).not.toMatch(/NaN|Infinity|undefined/);
    expect(must(withData.container, '[data-slot="hud-haven"] .value').getAttribute("data-provenance")).toBeTruthy();
    expect(must(withData.container, '[data-slot="hud-o2"] .value').getAttribute("data-source")).toBe("snapshot:crew.o2_frac");
    await withData.unmount();

    const empty = await mount(createElement(Hud, { crewId: "EV1", snapshot: null }));
    const text = empty.container.textContent ?? "";
    expect(text).not.toMatch(/NaN|Infinity|undefined|000°|0\.00 KM|via PR1/);
    expect(must(empty.container, '[data-slot="hud-haven"] .value').textContent).toBe("—");
    expect(must(empty.container, '[data-slot="hud-target"] .value').textContent).toContain("—");
    expect(must(empty.container, '[data-slot="hud-haven"]').textContent).toContain("UNKNOWN");
    expect(must(empty.container, '[data-slot="hud-o2"]').textContent).toContain("UNKNOWN");
  });

  it("HUD status values carry a shape and a word, not colour alone", async () => {
    const { container } = await mount(createElement(Hud, { crewId: "EV1", snapshot: snapshotOf("connect") }));
    for (const slot of ["hud-haven", "hud-o2"]) {
      const indicator = must(container, `[data-slot="${slot}"] .status-indicator`);
      expect(indicator.querySelector(".status-glyph")?.textContent).toBeTruthy();
      expect(indicator.querySelector(".status-label")?.textContent).toBeTruthy();
    }
  });

  it("link-lost keeps cached values labelled and shows the age as — unless one is supplied; never 'measured'", async () => {
    const noAge = await mount(createElement(HabLinkLost, { crewId: "EV1", snapshot: snapshotOf("link-lost-restored") }));
    expect(noAge.container.textContent).not.toMatch(/NaN|Infinity|undefined/);
    const age = must(noAge.container, '[data-slot="cached-telemetry"] > div:nth-child(3) .value');
    expect(age.textContent).toBe("—");
    expect(age.getAttribute("data-unavailable")).toBe("true");
    expect(age.getAttribute("data-provenance")).toBe("simulated");
    expect(age.getAttribute("data-source")).toBe("unavailable:link.age_seconds");
    await noAge.unmount();

    const withAge = await mount(createElement(HabLinkLost, { crewId: "EV1", snapshot: snapshotOf("link-lost-restored"), ageSeconds: 42 }));
    const supplied = must(withAge.container, '[data-slot="cached-telemetry"] > div:nth-child(3) .value');
    expect(supplied.textContent).toBe("42");
    expect(supplied.getAttribute("data-provenance")).toBe("simulated");
  });

  it("link-lost with no snapshot reads — and does not name a vehicle", async () => {
    const { container } = await mount(createElement(HabLinkLost, { crewId: "EV1", snapshot: null }));
    expect(container.textContent).not.toMatch(/NaN|via PR1/);
    expect(must(container, '[data-slot="cached-telemetry"] .value').textContent).toBe("—");
  });
});

describe("HoldToConfirm: hold, release, keyboard and tap fallback (04 §D.3)", () => {
  function press(onConfirm: () => unknown, extra: Record<string, unknown> = {}) {
    return createElement(HoldToConfirm, {
      label: "Test action",
      outcome: "Test accepted",
      onConfirm: onConfirm as () => void,
      ...extra,
    });
  }

  it("a short press does not dispatch; a full hold dispatches exactly one command", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn(async () => accepted());
    const { container } = await mount(press(onConfirm));
    const button = must<HTMLButtonElement>(container, "button");

    await pointerDown(button);
    expect(button.getAttribute("data-phase")).toBe("holding");
    await act(async () => { vi.advanceTimersByTime(300); });
    await pointerUp(button);
    await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS * 2); });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(button.getAttribute("data-phase")).not.toBe("done");

    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(button.getAttribute("data-phase")).toBe("idle");

    await pointerDown(button);
    await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS + 50); });
    await flush();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await pointerUp(button);
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("holding Enter or Space for 800 ms confirms; releasing early cancels", async () => {
    vi.useFakeTimers();
    for (const key of ["Enter", " "]) {
      const onConfirm = vi.fn(async () => accepted());
      const { container, unmount } = await mount(press(onConfirm));
      const button = must<HTMLButtonElement>(container, "button");

      await keyDown(button, key);
      await act(async () => { vi.advanceTimersByTime(200); });
      await keyUp(button, key);
      await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS); });
      expect(onConfirm).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(2000); });

      await keyDown(button, key);
      await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS + 50); });
      await flush();
      expect(onConfirm).toHaveBeenCalledTimes(1);
      await unmount();
    }
  });

  it("shows 'pending' (or 'queued' while unlinked) until the answer, and the outcome only once accepted", async () => {
    vi.useFakeTimers();
    let release: (v: ReturnType<typeof accepted>) => void = () => {};
    const slow = new Promise<ReturnType<typeof accepted>>((resolve) => { release = resolve; });
    const { container } = await mount(press(() => slow, { queued: true }));
    const button = must<HTMLButtonElement>(container, "button");

    await pointerDown(button);
    await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS + 50); });
    expect(button.getAttribute("data-phase")).toBe("pending");
    expect(button.textContent).toContain("Queued");
    expect(button.textContent).not.toContain("Test accepted");

    await act(async () => { release(accepted()); });
    expect(button.getAttribute("data-phase")).toBe("done");
    expect(button.textContent).toContain("Test accepted");
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(button.getAttribute("data-phase")).toBe("idle");
  });

  it("a rejected result shows the reason, never the success outcome", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn(async () => rejected("INVALID", "no active option"));
    const { container } = await mount(press(onConfirm));
    const button = must<HTMLButtonElement>(container, "button");

    await pointerDown(button);
    await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS + 50); });
    await flush();
    expect(button.getAttribute("data-phase")).toBe("rejected");
    expect(button.textContent).toContain("Rejected");
    expect(button.textContent).toContain("no active option");
    expect(button.textContent).not.toContain("Test accepted");
  });

  it("a second hold while pending does not dispatch twice", async () => {
    vi.useFakeTimers();
    let release: (v: ReturnType<typeof accepted>) => void = () => {};
    const onConfirm = vi.fn(() => new Promise<ReturnType<typeof accepted>>((resolve) => { release = resolve; }));
    const { container } = await mount(press(onConfirm));
    const button = must<HTMLButtonElement>(container, "button");

    await pointerDown(button);
    await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS + 50); });
    await pointerDown(button);
    await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS + 50); });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => { release(accepted()); });
  });

  it("tap fallback: the first tap only arms 'Confirm'; the second tap dispatches; an unused arm expires", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn(async () => accepted());
    const { container } = await mount(press(onConfirm, { tapFallback: true }));
    const button = must<HTMLButtonElement>(container, "button");

    // A real tap is pointerdown, pointerup, click.
    await pointerDown(button);
    await pointerUp(button);
    await click(button);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(button.getAttribute("data-phase")).toBe("confirm");
    expect(button.textContent).toContain("Confirm");

    await pointerDown(button);
    await pointerUp(button);
    await click(button);
    await flush();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1000); });

    // Armed but not confirmed: it goes back to idle after the fallback window.
    await click(button);
    expect(button.getAttribute("data-phase")).toBe("confirm");
    await act(async () => { vi.advanceTimersByTime(CONFIRM_FALLBACK_MS + 50); });
    expect(button.getAttribute("data-phase")).toBe("idle");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("tap fallback by keyboard also needs two presses", async () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn(async () => accepted());
    const { container } = await mount(press(onConfirm, { tapFallback: true }));
    const button = must<HTMLButtonElement>(container, "button");

    await keyDown(button, "Enter");
    expect(onConfirm).not.toHaveBeenCalled();
    await keyDown(button, "Enter");
    await flush();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("SUMMON and ABORT on the EVA action row send commands the Hab Core accepts (02 §E.4, §E.6)", () => {
  async function hold(button: Element): Promise<void> {
    await pointerDown(button);
    await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS + 50); });
    await flush();
  }

  it.each(["EV1", "EV2"] as const)("%s: SUMMON sends {crew:[self]} and ABORT sends {crew:[self]}", async (crewId) => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect", `eva:${crewId}`));
    const onDispatched = vi.fn();
    const onAborted = vi.fn();
    const { container } = await mount(
      createElement("div", null,
        createElement(SummonRoverButton, { client, crewId, onDispatched }),
        createElement(AbortToHabButton, { client, crewId, onAborted }),
      ),
    );

    await hold(must(container, "#action-summon-rover"));
    await act(async () => { vi.advanceTimersByTime(1000); });
    await hold(must(container, "#action-abort-hab"));

    expect(sent).toEqual([
      { kind: "SUMMON_VEHICLE", args: { crew: [crewId] } },
      { kind: "ABORT", args: { crew: [crewId] } },
    ]);
    expect(onDispatched).toHaveBeenCalledTimes(1);
    expect(onAborted).toHaveBeenCalledTimes(1);
  });

  it("a rejected SUMMON shows the rejection, does not fire onDispatched and invents no ETA", async () => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect"), () => rejected("NO_RENDEZVOUS", "no feasible rendezvous"));
    const onDispatched = vi.fn();
    const { container } = await mount(createElement(SummonRoverButton, { client, crewId: "EV1", onDispatched }));
    const button = must<HTMLButtonElement>(container, "#action-summon-rover");

    await hold(button);
    expect(sent).toHaveLength(1);
    expect(button.textContent).toContain("Rejected");
    expect(button.textContent).toContain("no feasible rendezvous");
    expect(button.textContent).not.toMatch(/ETA|dispatched/i);
    expect(onDispatched).not.toHaveBeenCalled();
  });

  it("an accepted ABORT says 'accepted', not 'walking now'", async () => {
    vi.useFakeTimers();
    const { client } = recordingClient(storeFromBeat("connect"));
    const { container } = await mount(createElement(AbortToHabButton, { client, crewId: "EV1" }));
    const button = must<HTMLButtonElement>(container, "#action-abort-hab");

    await hold(button);
    expect(button.textContent).toContain("Abort accepted");
    expect(button.textContent).not.toMatch(/walking/i);
  });

  it("without a client or a crew member the controls are disabled and nothing is sent", async () => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect"));
    const noClient = await mount(createElement(EvaActionRow, { crewId: "EV1" }));
    expect(must<HTMLButtonElement>(noClient.container, "#action-summon-rover").disabled).toBe(true);
    expect(must<HTMLButtonElement>(noClient.container, "#action-abort-hab").disabled).toBe(true);
    await noClient.unmount();

    const noCrew = await mount(createElement(EvaActionRow, { client }));
    const summon = must<HTMLButtonElement>(noCrew.container, "#action-summon-rover");
    expect(summon.disabled).toBe(true);
    await pointerDown(summon);
    await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS + 50); });
    expect(sent).toHaveLength(0);
  });

  it("while unlinked the pending state reads 'Queued — sends when link returns'", async () => {
    vi.useFakeTimers();
    const never = new Promise<ReturnType<typeof accepted>>(() => {});
    const { client } = recordingClient(storeFromBeat("connect"), () => never);
    const { container } = await mount(createElement(SummonRoverButton, { client, crewId: "EV1", linked: false }));
    const button = must<HTMLButtonElement>(container, "#action-summon-rover");

    await hold(button);
    expect(button.getAttribute("data-phase")).toBe("pending");
    expect(button.textContent).toContain("Queued — sends when link returns");
  });
});

describe("SCR-14 Options (04 §E.7)", () => {
  const option = (over: Partial<ContingencyOption>): ContingencyOption => ({
    option_id: "o-1",
    alert_id: "a-1",
    kind: "VEHICLE_RENDEZVOUS",
    crew_ids: ["EV1", "EV2"],
    eta_shelter_min: 9,
    expected_dose_ugy: 5,
    stops_dropped: [],
    violations: [],
    rank: 1,
    path_preview: [],
    rendezvous: null,
    ...over,
  });
  const withOptions = (options: ContingencyOption[]): Snapshot => ({ ...snapshotOf("connect"), options });

  async function hold(button: Element): Promise<void> {
    await pointerDown(button);
    await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS + 50); });
    await flush();
  }

  it("with no options it shows an empty state and cannot confirm; no sample ETA or dose appears", async () => {
    const { client, sent } = recordingClient(storeFromBeat("connect"));
    const { container } = await mount(createElement(Options, { crewId: "EV1", client, snapshot: { ...snapshotOf("connect"), options: [] } }));

    expect(must(container, '[data-slot="options-empty"]').textContent).toContain("—");
    expect(container.textContent).not.toMatch(/\b14\b|\b41\b|\b12 µGy|\b48 µGy|PR1/);
    expect(must<HTMLButtonElement>(container, "#action-confirm-option").disabled).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("renders the supplied options with labelled ETA, dose and drops, in rank order", async () => {
    const snap = withOptions([
      option({ option_id: "o-2", rank: 2, kind: "ABORT_TO_HAB", eta_shelter_min: 31, expected_dose_ugy: 70, stops_dropped: [2, 3] }),
      option({ option_id: "o-1", rank: 1 }),
    ]);
    const { container } = await mount(createElement(Options, { crewId: "EV1", snapshot: snap }));
    const radios = container.querySelectorAll('[role="radio"]');

    expect(radios).toHaveLength(2);
    expect(radios[0].textContent).toContain("RANK 1");
    expect(radios[0].textContent).toContain("9 MIN");
    expect(radios[1].textContent).toContain("31 MIN");
    expect(radios[1].textContent).toContain("STOPS 2, 3");
    for (const el of container.querySelectorAll('[role="radio"] [data-provenance]')) {
      expect(el.getAttribute("data-source")).toMatch(/^snapshot:options\./);
    }
  });

  it("maps options to the commands each role may send", () => {
    const rdv = option({ kind: "VEHICLE_RENDEZVOUS" });
    expect(commandForOption("eva", rdv, "EV1")).toEqual({
      supported: true, kind: "SUMMON_VEHICLE", args: { crew: ["EV1", "EV2"], option_id: "o-1" },
    });
    expect(commandForOption("eva", option({ kind: "ABORT_TO_HAB" }), "EV2")).toEqual({
      supported: true, kind: "ABORT", args: { crew: ["EV1", "EV2"] },
    });
    expect(commandForOption("ops", rdv, "EV1")).toEqual({ supported: true, kind: "APPROVE_OPTION", args: { option_id: "o-1" } });
    expect(commandForOption("eva", option({ kind: "CONTINUE_SKIP" }), "EV1")).toMatchObject({ supported: false });
    expect(commandForOption("eva", option({ kind: "TERRAIN_REFUGE" }), "EV1")).toMatchObject({ supported: false });
    expect(commandForOption("eva", option({ crew_ids: ["EV2"] }), "EV1")).toMatchObject({ supported: false });
  });

  it("EVA confirms a rendezvous with SUMMON_VEHICLE, an abort with ABORT, never APPROVE_OPTION", async () => {
    vi.useFakeTimers();
    for (const [kind, expected] of [
      ["VEHICLE_RENDEZVOUS", { kind: "SUMMON_VEHICLE", args: { crew: ["EV1", "EV2"], option_id: "o-1" } }],
      ["ABORT_TO_HAB", { kind: "ABORT", args: { crew: ["EV1", "EV2"] } }],
    ] as const) {
      const { client, sent } = recordingClient(storeFromBeat("connect"));
      const onSelectOption = vi.fn();
      const onClose = vi.fn();
      const { container, unmount } = await mount(
        createElement(Options, { client, variant: "eva", crewId: "EV1", snapshot: withOptions([option({ kind })]), onSelectOption, onClose }),
      );

      await hold(must(container, "#action-confirm-option"));
      expect(sent).toEqual([expected]);
      expect(sent.some((c) => c.kind === "APPROVE_OPTION")).toBe(false);
      expect(onSelectOption).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
      await unmount();
    }
  });

  it("a rejected command keeps the sheet open: no onSelectOption, no onClose, the reason is shown", async () => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect"), () => rejected("INVALID", "no active ABORT_TO_HAB option for the crew"));
    const onSelectOption = vi.fn();
    const onClose = vi.fn();
    const { container } = await mount(
      createElement(Options, { crewId: "EV1", client, snapshot: withOptions([option({ kind: "ABORT_TO_HAB" })]), onSelectOption, onClose }),
    );
    const button = must<HTMLButtonElement>(container, "#action-confirm-option");

    await hold(button);
    expect(sent).toHaveLength(1);
    expect(button.textContent).toContain("Rejected");
    expect(button.textContent).toContain("no active ABORT_TO_HAB option");
    expect(onSelectOption).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("EVA cannot confirm CONTINUE_SKIP (needs ops approval): the control is disabled and sends nothing", async () => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect"));
    const { container } = await mount(
      createElement(Options, { crewId: "EV1", client, variant: "eva", snapshot: withOptions([option({ kind: "CONTINUE_SKIP" })]) }),
    );
    const button = must<HTMLButtonElement>(container, "#action-confirm-option");

    expect(button.disabled).toBe(true);
    await pointerDown(button);
    await act(async () => { vi.advanceTimersByTime(HOLD_DURATION_MS + 50); });
    expect(sent).toHaveLength(0);
  });

  it("ops approves with APPROVE_OPTION {option_id}", async () => {
    vi.useFakeTimers();
    const { client, sent } = recordingClient(storeFromBeat("connect", "ops"));
    const { container } = await mount(
      createElement(Options, { client, variant: "ops", snapshot: withOptions([option({})]) }),
    );

    await hold(must(container, "#action-confirm-option"));
    expect(sent).toEqual([{ kind: "APPROVE_OPTION", args: { option_id: "o-1" } }]);
  });

  it("supports both eva bottom-sheet and ops side-panel variants (static check)", () => {
    const evaHtml = renderToStaticMarkup(createElement(Options, { crewId: "EV1", variant: "eva" }));
    const opsHtml = renderToStaticMarkup(createElement(Options, { variant: "ops" }));

    expect(evaHtml).toMatch(/data-variant="eva"/);
    expect(opsHtml).toMatch(/data-variant="ops"/);
  });
});

describe("EVA type scale: status words and map labels are at least 16 px (04 §A.3 #9)", () => {
  /** Loads the real stylesheets into the document so computed sizes come from the shipped CSS. */
  function loadStyles(): void {
    const style = document.createElement("style");
    style.textContent = ["tokens.css", "base.css", "patterns.css"].map((f) => readFileSync(join(STYLES_DIR, f), "utf8")).join("\n");
    document.head.appendChild(style);
  }
  const px = (el: Element): number => Number.parseFloat(window.getComputedStyle(el).fontSize);

  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("status words and glyphs on the EVA tablet, HUD, link-lost screen and map are 16 px or more", async () => {
    loadStyles();
    const screens = [
      createElement(EvaTablet, { crewId: "EV1", snapshot: snapshotOf("connect") }),
      createElement(Hud, { crewId: "EV1", snapshot: snapshotOf("connect") }),
      createElement(HabLinkLost, { crewId: "EV1", snapshot: snapshotOf("connect") }),
    ];
    for (const screen of screens) {
      const { container, unmount } = await mount(screen);
      const labels = container.querySelectorAll(".status-indicator .status-label");
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) expect(px(label)).toBeGreaterThanOrEqual(16);
      for (const glyph of container.querySelectorAll(".status-indicator .status-glyph")) expect(px(glyph)).toBeGreaterThanOrEqual(16);
      await unmount();
    }
  });

  it("the EVA options sheet uses 16 px status words; the ops variant keeps the 14 px UI size", async () => {
    loadStyles();
    const eva = await mount(createElement(Options, { crewId: "EV1", variant: "eva", snapshot: snapshotOf("connect") }));
    for (const label of eva.container.querySelectorAll(".status-label")) expect(px(label)).toBeGreaterThanOrEqual(16);
    await eva.unmount();

    const ops = await mount(createElement(Options, { variant: "ops", snapshot: snapshotOf("connect") }));
    for (const label of ops.container.querySelectorAll(".status-label")) expect(px(label)).toBe(14);
  });

  it("the layer picker's micro label in the full-screen map is 16 px", async () => {
    loadStyles();
    const { FullScreenMap } = await import("../../src/ui/map/FullScreenMap");
    const { container } = await mount(createElement(FullScreenMap, { orientation: "landscape", onClose: () => {} }));
    await click(must(container, "#map-ctrl-layers"));
    const micros = container.querySelectorAll(".micro");
    expect(micros.length).toBeGreaterThanOrEqual(3);
    for (const el of micros) expect(px(el)).toBeGreaterThanOrEqual(16);
    expect(container.textContent).toContain("SELECT LAYERS");
  });
});

describe("package 17 accessibility controls", () => {
  it("contrast toggle switches palette", async () => {
    const view = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot: snapshotOf("connect") }));
    const button = must(view.container, '[aria-label="Toggle high contrast"]');
    await click(button);
    expect(must(view.container, '[data-screen="SCR-12"]').getAttribute("data-contrast")).toBe("high");
  });
  it("tap confirm fallback sends only after the second tap", async () => {
    const { client, sent } = recordingClient(storeFromBeat("connect"));
    const view = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot: snapshotOf("connect") }));
    await click(must(view.container, '[aria-label="Tap confirm"]'));
    const summon = must(view.container, "#action-summon-rover");
    await click(summon);
    expect(sent).toHaveLength(0);
    await click(summon);
    expect(sent).toEqual([{ kind: "SUMMON_VEHICLE", args: { crew: ["EV1"] } }]);
  });
});

describe("package 17 map and layout", () => {
  it("provides a map host rather than the placeholder", async () => {
    const view = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot: snapshotOf("connect") }));
    expect(view.container.querySelector('[data-slot="map-canvas"]')).not.toBeNull();
    expect(view.container.textContent).not.toContain("[ Gale Crater");
  });
});

describe("package 17 stale telemetry", () => {
  it("shows last-linked age on HAVEN when unlinked", async () => {
    const base = snapshotOf("connect");
    const snapshot: Snapshot = { ...base, sim_time: "2024-05-20T13:05:30Z", crew: base.crew.map((crew) => ({ ...crew, linked: false, stale: true, last_linked_sim_time: "2024-05-20T13:05:00Z" })) };
    const view = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot }));
    const age = must(view.container, '[data-slot="haven"] [data-source="snapshot:sim_time+crew.last_linked_sim_time"]');
    expect(age.textContent).toContain("0:30");
  });
});
