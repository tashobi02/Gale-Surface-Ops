/**
 * QoL Q2: the HOLD / RESUME simulation control in the top-right of SCR-12, and HOLDING on SCR-13
 * (docs/plan/qol/README.md; 02 §E.6). One test per behaviour: the button sends SET_CREW_MOTION for its own crew member
 * and its label follows the snapshot, never its own state.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import type { Snapshot } from "@marswalk/protocol";
import { EvaTablet } from "../../src/ui/screens/scr12EvaTablet";
import { Hud } from "../../src/ui/screens/scr13Hud";
import { recordingClient, rejected, storeFromBeat } from "./fixtureStore";
import { click, flush, installDom, mount, must, removeDom } from "./domHarness";

beforeAll(() => installDom());
afterAll(() => removeDom());
afterEach(() => {
  document.body.innerHTML = "";
});

const withActivity = (activity: Snapshot["crew"][number]["activity"]): Snapshot => {
  const base = storeFromBeat("connect").state()!;
  return { ...base, crew: base.crew.map((c) => ({ ...c, activity })) };
};

const BUTTON = '[data-slot="crew-motion"] button';

describe("SCR-12 crew motion control (simulation control)", () => {
  it("sends HOLD while walking and RESUME while holding, labelled from the snapshot, with a SIM tag and a 56 px target", async () => {
    const { client, sent } = recordingClient(storeFromBeat("connect"));
    const walking = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot: withActivity("WALKING") }));
    const button = must(walking.container, BUTTON) as HTMLButtonElement;
    expect(button.textContent).toContain("HOLD");
    expect(button.textContent).not.toContain("RESUME");
    expect(must(walking.container, '[data-slot="crew-motion"]').textContent).toContain("SIM");
    expect(button.style.minHeight).toMatch(/56px/);
    expect(button.className).not.toMatch(/status-/);
    await click(button);
    expect(sent).toEqual([{ kind: "SET_CREW_MOTION", args: { crew_id: "EV1", motion: "HOLD" } }]);
    document.body.innerHTML = "";

    const rec = recordingClient(storeFromBeat("connect"));
    const holding = await mount(createElement(EvaTablet, { client: rec.client, crewId: "EV1", snapshot: withActivity("HOLDING") }));
    const resume = must(holding.container, BUTTON) as HTMLButtonElement;
    expect(resume.textContent).toContain("RESUME");
    await click(resume);
    expect(rec.sent).toEqual([{ kind: "SET_CREW_MOTION", args: { crew_id: "EV1", motion: "RESUME" } }]);
  });

  it("is disabled when the crew member is in the hab or heading for shelter, and shows a refusal", async () => {
    const { client } = recordingClient(storeFromBeat("connect"));
    const inHab = await mount(createElement(EvaTablet, { client, crewId: "EV1", snapshot: withActivity("TO_HAVEN") }));
    expect((must(inHab.container, BUTTON) as HTMLButtonElement).disabled).toBe(true);
    document.body.innerHTML = "";
    const refusing = recordingClient(storeFromBeat("connect"), () => rejected("INVALID", "EV1 is not walking"));
    const walking = await mount(createElement(EvaTablet, { client: refusing.client, crewId: "EV1", snapshot: withActivity("WALKING") }));
    await click(must(walking.container, BUTTON));
    await flush();
    expect(must(walking.container, '[data-slot="crew-motion-rejection"]').textContent).toContain("EV1 is not walking");
  });
});

describe("SCR-13 HUD", () => {
  it("shows HOLDING as the activity only while the crew member is held", async () => {
    const held = await mount(createElement(Hud, { crewId: "EV1", snapshot: withActivity("HOLDING") }));
    expect(must(held.container, '[data-hud-value="activity"]').textContent).toContain("HOLDING");
    document.body.innerHTML = "";
    const walking = await mount(createElement(Hud, { crewId: "EV1", snapshot: withActivity("WALKING") }));
    expect(walking.container.querySelector('[data-hud-value="activity"]')).toBeNull();
  });
});
