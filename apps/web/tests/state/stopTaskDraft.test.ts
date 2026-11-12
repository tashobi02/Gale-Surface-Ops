/** T32.26–T32.27: FR-54 drafts use C11 actions; task edits never enter the routing hash. */
import { afterEach, expect, it, vi } from "vitest";
import type { PublishPlanArgs, TaskLibraryEntry } from "@marswalk/protocol";
import { createStopTaskDraft, addDraft, editDraft, removeDraft, fetchTaskLibrary } from "../../src/state/stopTaskDraft";
import { exportPlan } from "../../src/export/planExport";
import { publishPlan } from "../../src/ui/briefing/publishPlan";
import { realPlan, STOP_FREE, STOP_POI } from "../ui/realPlanStore";
import { mockLoadedSite } from "../ui/map/mapFixtures";

const library: TaskLibraryEntry[] = [
  { library_task_id: "lt-boxwork-01", poi_id: STOP_POI.poi_id!, crew_id: "EV1", kind: "image", text: "Image the ridge crest" },
  { library_task_id: "lt-boxwork-02", poi_id: STOP_POI.poi_id!, crew_id: null, kind: "other", text: "Fixture task" },
];
afterEach(() => vi.unstubAllGlobals());

it("copies a POI's library tasks after addWaypoint; free stops have none, removal drops drafts and undo restores them", () => {
  const { store } = realPlan();
  const drafts = createStopTaskDraft(store, library);
  store.addWaypoint(STOP_POI);
  const copied = store.get().stop_tasks;
  expect(copied).toHaveLength(2);
  expect(copied.map(({ task_id: _id, ...task }) => task)).toEqual(library.map(({ library_task_id: _id, poi_id: _poi, ...task }) => ({ ...task, stop_id: STOP_POI.id })));
  store.addWaypoint(STOP_FREE);
  expect(store.get().stop_tasks).toEqual(copied);
  store.deleteWaypoint(STOP_POI.id);
  expect(store.get().stop_tasks).toEqual([]);
  store.undo();
  expect(store.get().stop_tasks).toEqual(copied);
  drafts.destroy();
});

it("edits, adds and deletes within one to four tasks and sixty characters, keeping the last valid value on rejection", () => {
  const { store } = realPlan();
  const drafts = createStopTaskDraft(store, library);
  store.addWaypoint(STOP_POI);
  const id = store.get().stop_tasks[0]!.task_id;
  expect(editDraft(store, id, { text: "a".repeat(60), kind: "observe" })).toBeNull();
  for (const text of ["", " ", "a".repeat(61)]) expect(editDraft(store, id, { text })).toMatch(/text|characters/i);
  expect(store.get().stop_tasks[0]!.text).toBe("a".repeat(60));
  for (const text of ["Measure the ridge", "Observe the crest"]) expect(addDraft(store, STOP_POI.id, { kind: "observe", text })).toBeNull();
  expect(addDraft(store, STOP_POI.id, { kind: "observe", text: "Sample the ridge" })).toMatch(/four|4/i);
  const ids = store.get().stop_tasks.map(task => task.task_id);
  expect(new Set(ids).size).toBe(4);
  for (const taskId of ids.slice(1)) expect(removeDraft(store, taskId)).toBeNull();
  expect(removeDraft(store, id)).toMatch(/one|1/i);
  expect(store.get().stop_tasks).toHaveLength(1);
  drafts.destroy();
});

it("publishes the edited drafts beside plan; task edits keep plan_hash, result, revision and worker requests unchanged", async () => {
  const plan = realPlan();
  const drafts = createStopTaskDraft(plan.store, library);
  plan.store.addWaypoint(STOP_POI);
  plan.answer();
  await Promise.resolve();
  const site = mockLoadedSite().site;
  const before = exportPlan(site, plan.store.get());
  const { result, plan_revision } = plan.store.get();
  const calls = plan.calls.length;
  const task = plan.store.get().stop_tasks[0]!;
  editDraft(plan.store, task.task_id, { text: "Observe the ridge", crew_id: null });
  addDraft(plan.store, STOP_POI.id, { kind: "sample", text: "Sample the ridge" });
  removeDraft(plan.store, task.task_id);
  const exported = exportPlan(site, plan.store.get());
  expect(exported).toEqual(before);
  expect(plan.store.get()).toMatchObject({ result, plan_revision });
  expect(plan.calls).toHaveLength(calls);
  const send = vi.fn().mockResolvedValue({ ok: true });
  await publishPlan({ plan: exported, stopTasks: plan.store.get().stop_tasks, openClient: () => ({ send }), closeClient: () => {} });
  const args = send.mock.calls[0]![0].args as PublishPlanArgs;
  expect(args.stop_tasks).toEqual(plan.store.get().stop_tasks);
  expect(args.plan.plan_hash).toBe(before.plan_hash);
  expect(args.plan).not.toHaveProperty("stop_tasks");
  drafts.destroy();
});

it("late library arrival backfills existing POI stops once and preserves authored tasks on refresh", () => {
  const { store } = realPlan();
  const drafts = createStopTaskDraft(store);
  store.addWaypoint(STOP_POI);
  expect(store.get().stop_tasks).toEqual([]);
  drafts.setLibrary(library);
  expect(store.get().stop_tasks).toHaveLength(2);
  const task = store.get().stop_tasks[0]!;
  editDraft(store, task.task_id, { text: "Observe the ridge" });
  drafts.setLibrary(library);
  expect(store.get().stop_tasks[0]!.text).toBe("Observe the ridge");
  expect(store.get().stop_tasks).toHaveLength(2);
  drafts.destroy();
  store.addWaypoint({ ...STOP_POI, id: "wp-3" });
  expect(store.get().stop_tasks).toHaveLength(2);
});

it("task ids stay unique for repeated POIs and for delete/re-add; only stops accept tasks", () => {
  const { store } = realPlan();
  const drafts = createStopTaskDraft(store, library);
  store.addWaypoint(STOP_POI);
  store.addWaypoint({ ...STOP_POI, id: STOP_FREE.id });
  expect(new Set(store.get().stop_tasks.map(task => task.task_id)).size).toBe(4);
  expect(addDraft(store, "wp-0", { kind: "other", text: "Observe the ridge" })).toMatch(/stop/i);
  store.deleteWaypoint(STOP_POI.id);
  store.addWaypoint(STOP_POI);
  expect(new Set(store.get().stop_tasks.map(task => task.task_id)).size).toBe(4);
  drafts.destroy();
});

it("loading a different plan with reused waypoint ids applies the new POI library instead of losing its tasks", () => {
  const { store } = realPlan();
  const drafts = createStopTaskDraft(store, library);
  store.addWaypoint({ ...STOP_FREE, id: STOP_POI.id });
  expect(store.get().stop_tasks).toEqual([]);
  store.loadPlan(store.get().scenario, [store.get().waypoints[0]!, STOP_POI]);
  expect(store.get().stop_tasks).toHaveLength(2);
  const task = store.get().stop_tasks[0]!;
  editDraft(store, task.task_id, { text: "Observe the ridge" });
  store.moveWaypoint(STOP_POI.id, STOP_POI.x_m, STOP_POI.y_m);
  expect(store.get().stop_tasks[0]!.text).toBe("Observe the ridge");
  store.loadPlan(store.get().scenario, store.get().waypoints);
  expect(store.get().stop_tasks).toHaveLength(2);
  expect(store.get().stop_tasks[0]!.text).toBe(library[0]!.text);
  drafts.destroy();
});

it("reads N-07 from the same-origin session snapshot and returns unavailable on a failed or malformed response", async () => {
  // Start the real observer first so this named test is also red against the unimplemented module.
  const drafts = createStopTaskDraft(realPlan().store);
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ task_library: library }) });
  vi.stubGlobal("fetch", fetcher);
  expect(await fetchTaskLibrary()).toEqual(library);
  expect(fetcher.mock.calls[0]![0]).toBe("api/session");
  fetcher.mockResolvedValue({ ok: false });
  expect(await fetchTaskLibrary()).toBeNull();
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ task_library: [{ text: "bad" }] }) });
  expect(await fetchTaskLibrary()).toBeNull();
  fetcher.mockRejectedValue(new Error("offline"));
  expect(await fetchTaskLibrary()).toBeNull();
  drafts.destroy();
});
