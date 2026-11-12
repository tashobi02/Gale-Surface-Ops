/** T32.26/T32.28: real SCR-04 task controls, validation, keyboard semantics and provenance. */
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { act, createElement } from "react";
import type { AppContext, WorkerClient } from "../../src/ui/context";
import type { TaskLibraryEntry } from "@marswalk/protocol";
import { PlanPanel } from "../../src/ui/screens/scr04PlanPanel";
import { StopTaskEditor } from "../../src/ui/plan/StopTaskEditor";
import { createStopTaskDraft } from "../../src/state/stopTaskDraft";
import { click, fire, installDom, mount, must, removeDom, type Mounted } from "./domHarness";
import { realPlan, STOP_FREE, STOP_POI } from "./realPlanStore";
import { mockLoadedSite } from "./map/mapFixtures";

beforeAll(installDom);
afterAll(removeDom);
const views: Mounted[] = [];
const cleanups: (() => void)[] = [];
afterEach(async () => { for (const view of views.splice(0)) await view.unmount(); for (const cleanup of cleanups.splice(0)) cleanup(); });
const library: TaskLibraryEntry[] = [{ library_task_id: "lt-boxwork-01", poi_id: STOP_POI.poi_id!, crew_id: "EV1", kind: "image", text: "Image the ridge crest", source_id: "poi-boxwork-ridge" }];

async function setup(panel = false, free = false) {
  const plan = realPlan();
  const drafts = createStopTaskDraft(plan.store, library);
  cleanups.push(drafts.destroy);
  const stop = free ? STOP_FREE : STOP_POI;
  plan.store.addWaypoint(stop);
  const ctx: AppContext = { site: mockLoadedSite(), planStore: plan.store, workerClient: {} as WorkerClient, debug: false };
  const view = await mount(panel ? createElement(PlanPanel, { ctx, taskLibrary: library }) : createElement(StopTaskEditor, { planStore: plan.store, stopId: stop.id, library }));
  views.push(view);
  return { ...plan, root: view.container, stop };
}
async function type(el: HTMLInputElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
const textInput = (root: ParentNode) => must<HTMLInputElement>(root, '[data-task-text]');

it("mounts an expandable editor under each SCR-04 stop, never the start", async () => {
  const { root, store } = await setup(true);
  const row = must(root, `[data-waypoint-id="${STOP_POI.id}"]`);
  expect(must(row, "[data-stop-task-editor]")).toBeTruthy();
  expect(root.querySelector('[data-role="start"] [data-stop-task-editor]')).toBeNull();
  await act(async () => { store.addWaypoint(STOP_FREE); });
  expect(root.querySelectorAll("[data-stop-task-editor]")).toHaveLength(2);
  expect(must(root, `[data-waypoint-id="${STOP_FREE.id}"] [data-stop-task-editor]`).textContent).toContain("No tasks");
});

it("invalid empty and overlong edits show inline errors and retain the last valid value after blur", async () => {
  const { root, store } = await setup();
  const input = textInput(root);
  const valid = store.get().stop_tasks[0]!.text;
  for (const invalid of ["", "a".repeat(61)]) {
    await type(input, invalid);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const alert = must(root, '[role="alert"]');
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    expect(alert.textContent).toMatch(/text|characters/i);
    expect(store.get().stop_tasks[0]!.text).toBe(valid);
    await act(async () => { input.focus(); input.blur(); });
    expect(input.value).toBe(valid);
  }
  await type(input, "Observe the ridge");
  expect(store.get().stop_tasks[0]!.text).toBe("Observe the ridge");
  expect(root.querySelector('[role="alert"]')).toBeNull();
});

it("adds kind and text, deletes drafts down to one, and explains the four-task limit", async () => {
  const { root, store } = await setup();
  const kind = must<HTMLSelectElement>(root, '[data-new-task-kind]');
  kind.value = "measure";
  await fire(kind, new window.Event("change", { bubbles: true }));
  for (const text of ["Measure the ridge", "Observe the crest", "Image the ledge"]) {
    await type(must(root, '[data-new-task-text]'), text);
    await click(must(root, '[data-add-task]'));
  }
  expect(store.get().stop_tasks).toHaveLength(4);
  expect(store.get().stop_tasks[1]!.kind).toBe("measure");
  expect(must<HTMLButtonElement>(root, '[data-add-task]').disabled).toBe(true);
  expect(root.textContent).toMatch(/four|4/);
  while (store.get().stop_tasks.length > 1) await click(must(root, '[data-delete-task]'));
  expect(must<HTMLButtonElement>(root, '[data-delete-task]').disabled).toBe(true);
  expect(root.textContent).toMatch(/at least one/i);
});

it("offers a first task for a free stop without inventing a draft or default text", async () => {
  const { root, store } = await setup(false, true);
  expect(store.get().stop_tasks).toEqual([]);
  expect(root.textContent).toContain("No tasks");
  const input = must<HTMLInputElement>(root, '[data-new-task-text]');
  expect(input.value).toBe("");
  await type(input, "Image the ridge crest");
  await click(must(root, '[data-add-task]'));
  expect(store.get().stop_tasks).toHaveLength(1);
});

it("uses labelled native keyboard controls and assumed text with its library or authored source", async () => {
  const { root } = await setup();
  const input = textInput(root);
  expect(input.getAttribute("data-provenance")).toBe("assumed");
  expect(input.getAttribute("data-source")).toBe(library[0]!.source_id);
  expect(must(root, '[data-task-kind]').getAttribute("data-source")).toBe(library[0]!.source_id);
  for (const control of root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) {
    expect(root.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
    expect(control.tabIndex).toBe(0);
  }
  input.focus();
  expect(document.activeElement).toBe(input);
  await type(input, "Observe the ridge");
  expect(input.getAttribute("data-provenance")).toBe("assumed");
  expect(input.getAttribute("data-source")).toMatch(/^user:stop_task\./);
  const kind = must<HTMLSelectElement>(root, '[data-task-kind]');
  kind.value = "observe";
  await fire(kind, new window.Event("change", { bubbles: true }));
  expect(kind.getAttribute("data-provenance")).toBe("assumed");
  expect(kind.getAttribute("data-source")).not.toBe("");
});
