/** T24.08/T24.10: visor groups and hold exit, FR-33. */
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import type { Snapshot } from "@marswalk/protocol";
import { act, createElement } from "react";
import { Hud } from "../../src/ui/screens/scr13Hud";
import { HudRoute } from "../../src/ui/live/HudRoute";
import { installDom, removeDom, mount, must, pointerDown, pointerUp, type Mounted } from "./domHarness";
import { storeFromBeat } from "./fixtureStore";
let view: Mounted | undefined;
beforeAll(installDom);
afterEach(async () => { await view?.unmount(); view = undefined; vi.useRealTimers(); });
afterAll(removeDom);
it("two-second hold exits with visible progress only while held", async () => {
  vi.useFakeTimers();
  window.location.hash = "#/hud/EV1";
  view = await mount(createElement(HudRoute, { crewId: "EV1" }));
  const frame = must(view.container, '[data-slot="hud-route"]');
  await pointerDown(frame);
  expect(must(view.container, '[data-slot="hud-exit-progress"]').getAttribute("data-holding")).toBe("true");
  await act(async () => { vi.advanceTimersByTime(1999); });
  expect(window.location.hash).toBe("#/hud/EV1");
  await act(async () => { vi.advanceTimersByTime(1); });
  expect(window.location.hash).toBe("#/eva/EV1");
});
it("release cancels and removes hold progress", async () => {
  vi.useFakeTimers();
  window.location.hash = "#/hud/EV2";
  view = await mount(createElement(HudRoute, { crewId: "EV2" }));
  const frame = must(view.container, '[data-slot="hud-route"]');
  await pointerDown(frame);
  await act(async () => { vi.advanceTimersByTime(1900); });
  await pointerUp(frame);
  expect(view.container.querySelector('[data-holding="true"]')).toBeNull();
  await act(async () => { vi.advanceTimersByTime(3000); });
  expect(window.location.hash).toBe("#/hud/EV2");
});
it("at most five values: alert, haven, next, oxygen and link, with sub-labels and no tasks or controls", async () => {
  const base = storeFromBeat("connect").state()!;
  const snapshot: Snapshot = { ...base, alerts: [{ alert_id: "alert-fixture", code: "RADIATION_ALERT", level: "warning" as const, subjects: ["EV1"], raised_seq: 1, acked_seq: null, cleared_seq: null, acked_by: null, message: "Shelter now", data: {} }] };
  view = await mount(createElement(Hud, { crewId: "EV1", snapshot }));
  const values = [...view.container.querySelectorAll<HTMLElement>("[data-hud-value]")];
  expect(values.map((el) => el.dataset.hudValue)).toEqual(["alert", "haven", "next", "o2", "link"]);
  for (const el of values) {
    expect(el.dataset.provenance || el.dataset.unavailable).toBeTruthy();
    expect(el.dataset.source).toBeTruthy();
    expect(el.style.fontSize).toMatch(/56px|64px|72px|--text-value-hud/);
  }
  expect(must(view.container, '[data-hud-value="alert"]').style.textTransform).not.toBe("uppercase");
  expect(view.container.querySelector("button, a, input, [role=button]")).toBeNull();
  expect(view.container.textContent).not.toMatch(/TASKS/);
});
