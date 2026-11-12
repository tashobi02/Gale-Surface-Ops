/** T32.26/T32.28: real SCR-04 task controls, validation, keyboard semantics and provenance. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import type { AppContext, WorkerClient } from "../../src/ui/context";
import type { TaskLibraryEntry } from "@marswalk/protocol";
import { PlanPanel } from "../../src/ui/screens/scr04PlanPanel";
import { StopTaskEditor } from "../../src/ui/plan/StopTaskEditor";
import { createStopTaskDraft } from "../../src/state/stopTaskDraft";
import { click, fire, installDom, keyDown, mount, must, removeDom, type Mounted } from "./domHarness";
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
    // The text reverted on blur, so the error about the rejected text is gone with it.
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
    expect(root.querySelector('[role="alert"]')).toBeNull();
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
  expect(must<HTMLButtonElement>(root, '[data-add-task]').getAttribute("aria-disabled")).toBe("true");
  expect(root.textContent).toMatch(/four|4/);
  while (store.get().stop_tasks.length > 1) await click(must(root, '[data-delete-task]'));
  expect(must<HTMLButtonElement>(root, '[data-delete-task]').getAttribute("aria-disabled")).toBe("true");
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

const newText = (root: ParentNode) => must<HTMLInputElement>(root, '[data-new-task-text]');
const addButton = (root: ParentNode) => must<HTMLButtonElement>(root, '[data-add-task]');
const rowText = (root: ParentNode) => [...root.querySelectorAll<HTMLInputElement>('[data-task-text]')].map(input => input.value);

it("Enter in the new-task box adds the task, clears the box and keeps focus there; invalid text adds nothing", async () => {
  const { root, store } = await setup();
  const input = newText(root);
  await act(async () => input.focus());
  await type(input, "Measure the ridge");
  await keyDown(input, "Enter");
  expect(store.get().stop_tasks.map(t => t.text)).toEqual([library[0]!.text, "Measure the ridge"]);
  expect(input.value).toBe("");
  expect(document.activeElement).toBe(input);
  await keyDown(input, "Enter");
  expect(store.get().stop_tasks).toHaveLength(2);
  await type(input, "   ");
  await keyDown(input, "Enter");
  expect(store.get().stop_tasks).toHaveLength(2);
});

it("the add button and the new-task box are never disabled while they hold focus: aria-disabled at the limit and for blank text", async () => {
  const { root, store } = await setup();
  const input = newText(root);
  const button = addButton(root);
  await act(async () => input.focus());
  for (const text of ["Measure the ridge", "Observe the crest", "Image the ledge"]) {
    await type(input, text);
    expect(button.getAttribute("aria-disabled")).toBeNull();
    await keyDown(input, "Enter");
    expect(document.activeElement, `after adding "${text}"`).toBe(input);
  }
  expect(store.get().stop_tasks).toHaveLength(4);
  expect(input.disabled).toBe(false);
  expect(button.disabled).toBe(false);
  expect(input.getAttribute("aria-disabled")).toBe("true");
  expect(input.readOnly).toBe(true);
  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(input);
  await act(async () => button.focus());
  expect(document.activeElement).toBe(button);
  await click(button);
  expect(store.get().stop_tasks).toHaveLength(4);
  expect(document.activeElement).toBe(button);
  const kind = must<HTMLSelectElement>(root, "[data-new-task-kind]");
  expect(kind.disabled).toBe(false);
  expect(kind.getAttribute("aria-disabled")).toBe("true");
});

it("the four-task limit is explained to assistive technology: the box, the kind and the button reference the message", async () => {
  const { root } = await setup();
  for (const text of ["Measure the ridge", "Observe the crest", "Image the ledge"]) {
    await type(newText(root), text);
    await click(addButton(root));
  }
  const message = must(root, ".stop-task-new .stop-task-help");
  expect(message.id).not.toBe("");
  expect(message.textContent).toMatch(/at most four|four tasks|4/i);
  for (const control of [newText(root), addButton(root)]) expect(control.getAttribute("aria-describedby")).toContain(message.id);
  expect(document.getElementById(message.id)).toBe(message);
});

it("clicking Add with the box blank shows the problem instead of doing nothing, and focus returns to the box after a successful add", async () => {
  const { root, store } = await setup();
  const button = addButton(root);
  expect(button.getAttribute("aria-disabled")).toBe("true");
  await act(async () => button.focus());
  await click(button);
  expect(store.get().stop_tasks).toHaveLength(1);
  expect(must(root, '[role="alert"]').textContent).toMatch(/empty|blank|spaces/i);
  expect(newText(root).getAttribute("aria-invalid")).toBe("true");
  await type(newText(root), "Measure the ridge");
  expect(root.querySelector('[role="alert"]')).toBeNull();
  await act(async () => button.focus());
  await click(button);
  expect(store.get().stop_tasks).toHaveLength(2);
  expect(document.activeElement).toBe(newText(root));
  expect(button.getAttribute("aria-disabled")).toBe("true");
});

it("new-task errors name the problem without claiming a last valid text; an existing task's errors do", async () => {
  const { root } = await setup();
  await type(newText(root), "   ");
  const blank = must(root, '[role="alert"]').textContent!;
  expect(blank).toMatch(/empty|blank|spaces/i);
  expect(blank).not.toMatch(/1–60|last valid/);
  await type(newText(root), "a".repeat(61));
  const long = must(root, '[role="alert"]').textContent!;
  expect(long).toMatch(/60/);
  expect(long).not.toMatch(/last valid/i);
  await type(textInput(root), "");
  expect(root.textContent).toMatch(/Keeping the last valid text\./);
});

async function fourTasks() {
  const base = await setup();
  for (const text of ["Measure the ridge", "Observe the crest", "Image the ledge"]) {
    await type(newText(base.root), text);
    await click(addButton(base.root));
  }
  return base;
}
const deleteButtons = (root: ParentNode) => [...root.querySelectorAll<HTMLButtonElement>("[data-delete-task]")];

it("deleting a task moves focus to the next task's text, to the previous one for the last task, and never to the page body", async () => {
  const { root, store } = await fourTasks();
  await act(async () => deleteButtons(root)[1]!.focus());
  await click(deleteButtons(root)[1]!);
  expect(rowText(root)).toEqual([library[0]!.text, "Observe the crest", "Image the ledge"]);
  expect(document.activeElement).toBe(root.querySelectorAll('[data-task-text]')[1]);
  await act(async () => deleteButtons(root)[2]!.focus());
  await click(deleteButtons(root)[2]!);
  expect(document.activeElement).toBe(root.querySelectorAll('[data-task-text]')[1]);
  await act(async () => deleteButtons(root)[0]!.focus());
  await click(deleteButtons(root)[0]!);
  expect(store.get().stop_tasks).toHaveLength(1);
  expect(document.activeElement).toBe(textInput(root));
  expect(document.activeElement).not.toBe(document.body);
});

it("the only task cannot be deleted, yet its delete button stays focusable and keeps focus when pressed", async () => {
  const { root, store } = await setup();
  const remove = must<HTMLButtonElement>(root, "[data-delete-task]");
  expect(remove.disabled).toBe(false);
  expect(remove.getAttribute("aria-disabled")).toBe("true");
  expect(remove.getAttribute("aria-describedby")).toBe(must(root, ".stop-task-row .stop-task-help").id);
  await act(async () => remove.focus());
  await click(remove);
  await keyDown(remove, "Enter");
  expect(store.get().stop_tasks).toHaveLength(1);
  expect(document.activeElement).toBe(remove);
});

it("the kind select only offers protocol kinds and writes one back", async () => {
  const { root, store } = await setup();
  const select = must<HTMLSelectElement>(root, "[data-task-kind]");
  expect([...select.options].map(o => o.value)).toEqual(["observe", "image", "sample", "measure", "deploy", "other"]);
  select.value = "deploy";
  await fire(select, new window.Event("change", { bubbles: true }));
  expect(store.get().stop_tasks[0]!.kind).toBe("deploy");
});

it("reordering stops keeps each stop's tasks under its own row in the plan panel", async () => {
  const { root, store } = await setup(true);
  await act(async () => { store.addWaypoint({ ...STOP_FREE, id: "wp-2" }); });
  await type(must<HTMLInputElement>(must(root, '[data-waypoint-id="wp-2"]'), "[data-new-task-text]"), "Observe the ridge");
  await click(must(must(root, '[data-waypoint-id="wp-2"]'), "[data-add-task]"));
  const textsOf = (id: string) => rowText(must(root, `[data-waypoint-id="${id}"]`));
  const before = { "wp-1": textsOf("wp-1"), "wp-2": textsOf("wp-2") };
  expect(before["wp-2"]).toEqual(["Observe the ridge"]);
  await act(async () => { store.reorderWaypoints(["wp-2", "wp-1"]); });
  const order = [...root.querySelectorAll("[data-waypoint-id]")].map(row => row.getAttribute("data-waypoint-id"));
  expect(order.filter(id => id !== "wp-0")).toEqual(["wp-2", "wp-1"]);
  expect({ "wp-1": textsOf("wp-1"), "wp-2": textsOf("wp-2") }).toEqual(before);
});

describe("N-07 library status in the editor: loading, unavailable and empty are different (package 25 review)", () => {
  async function poiStop(props: Record<string, unknown>) {
    const plan = realPlan();
    plan.store.addWaypoint(STOP_POI);
    const make = (extra: Record<string, unknown>) => createElement(StopTaskEditor, { planStore: plan.store, stopId: STOP_POI.id, library: [], ...extra });
    const view = await mount(make(props));
    views.push(view);
    return { ...plan, view, root: view.container, rerender: (extra: Record<string, unknown>) => view.rerender(make(extra)) };
  }
  const notice = (root: ParentNode) => root.querySelector<HTMLElement>("[data-task-library]");

  it("a POI stop says the library is unavailable, not that it has no tasks, and offers Retry", async () => {
    const retry = vi.fn();
    const { root } = await poiStop({ libraryStatus: "unavailable", onRetryLibrary: retry });
    const box = must(root, "[data-task-library]");
    expect(box.textContent).toContain("Task library unavailable — suggested tasks not loaded");
    expect(box.querySelector('[data-unavailable="true"]') ?? box.closest('[data-unavailable="true"]')).not.toBeNull();
    expect(root.textContent).not.toContain("No tasks");
    await click(must(box, "[data-retry-task-library]"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("a POI stop shows a loading line while the library is in flight, and not 'No tasks'", async () => {
    const { root } = await poiStop({ libraryStatus: "loading" });
    expect(must(root, "[data-task-library]").textContent).toContain("Loading suggested tasks");
    expect(root.textContent).not.toContain("No tasks");
    expect(root.querySelector("[data-unavailable]")).toBeNull();
    expect(root.querySelector("[data-retry-task-library]")).toBeNull();
  });

  it("a loaded library with nothing for this POI is an honest empty list; a free stop never shows the notice", async () => {
    const { root } = await poiStop({ libraryStatus: "ready" });
    expect(notice(root)).toBeNull();
    expect(root.textContent).toContain("No tasks. Add the first task for this stop.");
    const plan = realPlan();
    plan.store.addWaypoint(STOP_FREE);
    const view = await mount(createElement(StopTaskEditor, { planStore: plan.store, stopId: STOP_FREE.id, library: [], libraryStatus: "unavailable" }));
    views.push(view);
    expect(notice(view.container)).toBeNull();
    expect(view.container.textContent).toContain("No tasks. Add the first task for this stop.");
  });

  it("Retry keeps focus while the library loads again, then hands it to the new-task box once the library is back", async () => {
    const retry = vi.fn();
    const { root, rerender } = await poiStop({ libraryStatus: "unavailable", onRetryLibrary: retry });
    const button = must<HTMLButtonElement>(root, "[data-retry-task-library]");
    await act(async () => button.focus());
    await click(button);
    await rerender({ libraryStatus: "loading", onRetryLibrary: retry });
    const again = must<HTMLButtonElement>(root, "[data-retry-task-library]");
    expect(again).toBe(button);
    expect(again.disabled).toBe(false);
    expect(again.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(again);
    await click(again);
    expect(retry).toHaveBeenCalledTimes(1);
    await rerender({ libraryStatus: "ready", library: [], onRetryLibrary: retry });
    expect(notice(root)).toBeNull();
    expect(document.activeElement).toBe(newText(root));
  });
});
