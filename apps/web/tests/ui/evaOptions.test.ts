/**
 * SCR-14 follow-ups (docs/specs/04 §E.7; 01 FR-40, FR-44, FR-15): option values carry the provenance the Hab Core gave,
 * a new proposal resets the choice, the radio group answers the arrow keys, and SCR-12's clickable areas are real buttons.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import type { ContingencyOption, ProvenanceMap, ServerMessage, Snapshot } from "@marswalk/protocol";
import { connectHab, type HabClient, type SocketLike } from "../../src/net/habClient";
import { Options } from "../../src/ui/screens/scr14Options";
import { EvaTablet } from "../../src/ui/screens/scr12EvaTablet";
import { wsFixtures } from "../fixtures/ws";
import { storeFromBeat } from "./fixtureStore";
import { click, installDom, keyDown, mount, must, removeDom } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

const option = (over: Partial<ContingencyOption>): ContingencyOption => ({
  option_id: "o-1", alert_id: "a-1", kind: "VEHICLE_RENDEZVOUS", crew_ids: ["EV1", "EV2"], eta_shelter_min: 9, expected_dose_ugy: 5,
  stops_dropped: [], violations: [], rank: 1, path_preview: [], rendezvous: null, ...over,
});
const three = (alert_id = "a-1", prefix = "o"): ContingencyOption[] => [
  option({ alert_id, option_id: `${prefix}-1`, rank: 1 }),
  option({ alert_id, option_id: `${prefix}-2`, rank: 2, kind: "ABORT_TO_HAB", eta_shelter_min: 31 }),
  option({ alert_id, option_id: `${prefix}-3`, rank: 3, kind: "TERRAIN_REFUGE", eta_shelter_min: 40 }),
];
const withOptions = (options: ContingencyOption[]): Snapshot => ({ ...storeFromBeat("connect").state()!, options });

const radios = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[role="radio"]')];
const checked = (root: HTMLElement) => radios(root).map((r) => r.getAttribute("aria-checked"));

/** The `options-proposed` fixture event with another provenance map. */
function proposedWith(provenance: ProvenanceMap, data?: Record<string, unknown>): { event: ServerMessage; options: ContingencyOption[] } {
  const proposed = wsFixtures["options-proposed"][0] as Extract<ServerMessage, { type: "EVENT" }>;
  return {
    event: { ...proposed, event: { ...proposed.event, data: data ?? proposed.event.data, provenance } },
    options: (proposed.event.data as { options: ContingencyOption[] }).options,
  };
}

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
function live(): { client: HabClient; socket: FakeSocket } {
  const socket = new FakeSocket();
  const client = connectHab({ role: "eva:EV1", clientId: "c-test", displayName: "EV1", url: "ws://localhost/ws", socketFactory: () => socket });
  return { client, socket };
}

describe("option values carry the provenance the Hab Core gave (FR-15)", () => {
  it("with the OPTIONS_PROPOSED event in the store, ETA and dose take its class, not a fixed 'modelled'", async () => {
    const { client, socket } = live();
    const { event, options } = proposedWith({ "data.options[].eta_shelter_min": "derived", "data.options[].expected_dose_ugy": "replayed" });
    const snapshot = { ...(wsFixtures.connect[0] as Snapshot), options };
    const { container } = await mount(createElement(Options, { client, crewId: "EV1" }));
    await socket.receive(snapshot, event);

    const first = radios(container)[0];
    const eta = must(first, '[data-source="snapshot:options.eta_shelter_min"]');
    const dose = must(first, '[data-source="snapshot:options.expected_dose_ugy"]');
    expect(eta.getAttribute("data-provenance")).toBe("derived");
    expect(eta.textContent).toContain("◆");
    expect(dose.getAttribute("data-provenance")).toBe("replayed");
    expect(dose.textContent).toContain("▶");
  });

  it("the hab-core spelling of the key ('data.options.eta_shelter_min') is read too", async () => {
    const { client, socket } = live();
    const { event, options } = proposedWith({ "data.options.eta_shelter_min": "simulated" });
    const snapshot = { ...(wsFixtures.connect[0] as Snapshot), options };
    const { container } = await mount(createElement(Options, { client, crewId: "EV1" }));
    await socket.receive(snapshot, event);

    expect(must(radios(container)[0], '[data-source="snapshot:options.eta_shelter_min"]').getAttribute("data-provenance")).toBe("simulated");
  });

  it("a class that is not one of the six is not shown; the 05 class of the field is", async () => {
    const { client, socket } = live();
    const { event, options } = proposedWith({ "data.options[].eta_shelter_min": "live" as never });
    const snapshot = { ...(wsFixtures.connect[0] as Snapshot), options };
    const { container } = await mount(createElement(Options, { client, crewId: "EV1" }));
    await socket.receive(snapshot, event);

    expect(must(radios(container)[0], '[data-source="snapshot:options.eta_shelter_min"]').getAttribute("data-provenance")).toBe("modelled");
  });

  it("without an event ETA and dose show the class 05 gives them; the dropped-stops count, which 05 gives none, carries no class", async () => {
    const { container } = await mount(createElement(Options, { crewId: "EV1", snapshot: withOptions(three()) }));
    const first = radios(container)[0];

    expect(must(first, '[data-source="snapshot:options.eta_shelter_min"]').getAttribute("data-provenance")).toBe("modelled");
    expect(must(first, '[data-source="snapshot:options.expected_dose_ugy"]').getAttribute("data-provenance")).toBe("modelled");
    const drops = must(first, '[data-source="snapshot:options.stops_dropped"]');
    expect(drops.getAttribute("data-provenance")).toBeNull();
    expect(drops.textContent).not.toMatch(/[■◆○△▶◇]/);
  });

  it("the event of another alert does not label this alert's options", async () => {
    const { client, socket } = live();
    const { event: other } = proposedWith({ "data.options[].eta_shelter_min": "replayed" }, { alert_id: "a-other", options: [] });
    const snapshot = { ...(wsFixtures.connect[0] as Snapshot), options: three("a-1") };
    const { container } = await mount(createElement(Options, { client, crewId: "EV1" }));
    await socket.receive(snapshot, other);

    expect(must(radios(container)[0], '[data-source="snapshot:options.eta_shelter_min"]').getAttribute("data-provenance")).toBe("modelled");
  });
});

describe("the choice resets when a new proposal arrives (04 §E.7: the top option is pre-selected)", () => {
  it("choosing rank 2, then a new proposal: the new top option is selected", async () => {
    const view = await mount(createElement(Options, { crewId: "EV1", snapshot: withOptions(three("a-1", "o")) }));
    await click(radios(view.container)[1]);
    expect(checked(view.container)).toEqual(["false", "true", "false"]);

    await view.rerender(createElement(Options, { crewId: "EV1", snapshot: withOptions(three("a-2", "p")) }));
    expect(checked(view.container)).toEqual(["true", "false", "false"]);
    expect(must(view.container, "#action-confirm-option").getAttribute("aria-label")).toContain("Option 1");
  });

  it("the same proposal re-rendered keeps the choice", async () => {
    const view = await mount(createElement(Options, { crewId: "EV1", snapshot: withOptions(three()) }));
    await click(radios(view.container)[2]);
    await view.rerender(createElement(Options, { crewId: "EV1", snapshot: { ...withOptions(three()), seq: 999 } }));
    expect(checked(view.container)).toEqual(["false", "false", "true"]);
  });

  it("a proposal with the same option ids for another alert also resets it", async () => {
    const view = await mount(createElement(Options, { crewId: "EV1", snapshot: withOptions(three("a-1")) }));
    await click(radios(view.container)[1]);
    await view.rerender(createElement(Options, { crewId: "EV1", snapshot: withOptions(three("a-2")) }));
    expect(checked(view.container)).toEqual(["true", "false", "false"]);
  });
});

describe("the options radio group answers the keyboard (WAI-ARIA radio group)", () => {
  async function group() {
    const view = await mount(createElement(Options, { crewId: "EV1", snapshot: withOptions(three()) }));
    radios(view.container)[0].focus();
    return view;
  }

  it("only the selected radio is in the tab order", async () => {
    const { container } = await group();
    expect(radios(container).map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });

  it("ArrowDown and ArrowRight select and focus the next radio, wrapping at the end", async () => {
    const { container } = await group();
    await keyDown(document.activeElement!, "ArrowDown");
    expect(checked(container)).toEqual(["false", "true", "false"]);
    expect(document.activeElement).toBe(radios(container)[1]);
    expect(radios(container).map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    await keyDown(document.activeElement!, "ArrowRight");
    await keyDown(document.activeElement!, "ArrowDown");
    expect(checked(container)).toEqual(["true", "false", "false"]);
    expect(document.activeElement).toBe(radios(container)[0]);
  });

  it("ArrowUp and ArrowLeft go back, wrapping at the start; Home and End jump", async () => {
    const { container } = await group();
    await keyDown(document.activeElement!, "ArrowUp");
    expect(checked(container)).toEqual(["false", "false", "true"]);
    await keyDown(document.activeElement!, "ArrowLeft");
    expect(checked(container)).toEqual(["false", "true", "false"]);
    await keyDown(document.activeElement!, "Home");
    expect(checked(container)).toEqual(["true", "false", "false"]);
    await keyDown(document.activeElement!, "End");
    expect(checked(container)).toEqual(["false", "false", "true"]);
  });

  it("Space and Enter still select the focused radio, and other keys change nothing", async () => {
    const { container } = await group();
    radios(container)[1].focus();
    await keyDown(radios(container)[1], " ");
    expect(checked(container)).toEqual(["false", "true", "false"]);
    await keyDown(radios(container)[2], "Enter");
    expect(checked(container)).toEqual(["false", "false", "true"]);
    await keyDown(radios(container)[2], "a");
    expect(checked(container)).toEqual(["false", "false", "true"]);
  });
});

describe("SCR-12 clickable areas are buttons, not clickable divs", () => {
  async function tablet() {
    const onOpenOptions = vi.fn();
    const onOpenFullScreenMap = vi.fn();
    const snapshot: Snapshot = {
      ...storeFromBeat("connect").state()!,
      alerts: [{ alert_id: "a-1", code: "COMM_SHADOW", level: "caution", subjects: ["EV1"], raised_seq: 1, acked_seq: null, cleared_seq: null, acked_by: null, message: "Comm shadow", data: {} }],
    };
    const view = await mount(createElement(EvaTablet, { crewId: "EV1", snapshot, onOpenOptions, onOpenFullScreenMap }));
    return { ...view, onOpenOptions, onOpenFullScreenMap };
  }

  it("the alert's OPTIONS control is the button that opens the options; the bar itself is not clickable", async () => {
    const { container, onOpenOptions } = await tablet();
    await click(must(container, '[data-slot="alert"]'));
    expect(onOpenOptions).not.toHaveBeenCalled();

    const button = must<HTMLButtonElement>(container, '[data-slot="alert"] button');
    expect(button.tagName).toBe("BUTTON");
    await click(button);
    expect(onOpenOptions).toHaveBeenCalledTimes(1);
  });

  it("the map area is a labelled button that opens the full map; the card around it is not clickable", async () => {
    const { container, onOpenFullScreenMap } = await tablet();
    await click(must(container, '[data-slot="mini-map"]'));
    expect(onOpenFullScreenMap).not.toHaveBeenCalled();

    const area = must<HTMLButtonElement>(container, '[data-slot="mini-map"] [data-slot="mini-map-open"]');
    expect(area.tagName).toBe("BUTTON");
    expect(area.getAttribute("aria-label")).toMatch(/full-screen map/i);
    await click(area);
    expect(onOpenFullScreenMap).toHaveBeenCalledTimes(1);

    await click(must(container, "#action-open-full-map"));
    expect(onOpenFullScreenMap).toHaveBeenCalledTimes(2);
  });
});
