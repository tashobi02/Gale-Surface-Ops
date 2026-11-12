/**
 * diffSnapshots (src/stateDelta.ts): the STATE_DELTA between two SNAPSHOTs, in the path syntax of the web client
 * (apps/web/src/net/habClient.ts `withPath`: "crew/EV1/o2_frac", array items matched by their `*_id` field).
 */
import { describe, expect, it } from "vitest";
import type { Alert, Snapshot, StopTask } from "@marswalk/protocol";
import { diffSnapshots } from "../src/stateDelta";

const base: Snapshot = {
  v: 1, type: "SNAPSHOT", seq: 10, sim_time: "2024-05-20T13:05:00Z",
  session: { session_id: "s-0007", scenario_id: "x", data_version: "d", seed: 1, status: "RUNNING", clock: { sim_time: "2024-05-20T13:05:00Z", speed: 1, paused: false }, plan_revision: 1, last_seq: 10, log_hash: "h1" },
  plan: null,
  crew: [{ crew_id: "EV1", x_m: 1, y_m: 2, activity: "WALKING", stop_index: null, o2_frac: 0.7, eva_elapsed_s: 0, dose_event_ugy: 0, dose_event_unsheltered_ugy: 0, haven: { minutes: 10, kind: "hab", target_x_m: 0, target_y_m: 0 }, linked: true, link_path: [], stale: false }],
  vehicles: [], alerts: [], options: [], tasks: [],
  earth: { light_time_s: 0, next_pass_utc: null, blackout: false, queue: [] }, clients: [], provenance: {},
  conditions: { ltst: null, sun_elevation_deg: null, dose_rate_background_ugy_h: null, dose_rate_event_ugy_h: null, event_series_utc: null, sol: null, source_ids: {}, provenance: {} }, task_library: [], event_library: [], next_stop_target: null,
};
const alert: Alert = { alert_id: "a-1", code: "COMM_SHADOW", level: "caution", subjects: ["EV1"], raised_seq: 11, acked_seq: null, cleared_seq: null, acked_by: null, message: "m", data: {} };
const task: StopTask = { task_id: "t-1", stop_id: "wp-2", crew_id: "EV1", kind: "image", text: "t", state: "TODO", reason: null, origin: "plan", updated_sim_time: "", updated_by: "system", provenance: {} };

describe("diffSnapshots", () => {
  it("sends a conditions change as conditions/<key> and a next-stop change whole; the static libraries are never diffed (BD-75, BD-104)", () => {
    const after: Snapshot = {
      ...base,
      conditions: { ...base.conditions, sol: 4190, sun_elevation_deg: 12.5, provenance: { sol: "derived" } },
      next_stop_target: { stop_id: "wp-2", stop_index: 1 },
      task_library: [{ library_task_id: "lt-1", poi_id: "poi-1", crew_id: null, kind: "image", text: "Image the ridge crest" }],
    };
    expect(diffSnapshots(base, after)).toEqual([
      { path: "conditions/sun_elevation_deg", value: 12.5 },
      { path: "conditions/sol", value: 4190 },
      { path: "conditions/provenance", value: { sol: "derived" } },
      { path: "next_stop_target", value: { stop_id: "wp-2", stop_index: 1 } },
    ]);
  });

  it("is empty for the same snapshot and for equal copies", () => {
    expect(diffSnapshots(base, base)).toEqual([]);
    expect(diffSnapshots(base, JSON.parse(JSON.stringify(base)))).toEqual([]);
  });

  it("changes a crew field by path and ignores the client list", () => {
    const after = { ...base, clients: [{ client_id: "c", role: "ops" as const, display_name: "" }], crew: [{ ...base.crew[0], o2_frac: 0.6, haven: { ...base.crew[0].haven, minutes: 9 } }] };
    expect(diffSnapshots(base, after)).toEqual([
      { path: "crew/EV1/o2_frac", value: 0.6 },
      { path: "crew/EV1/haven", value: { minutes: 9, kind: "hab", target_x_m: 0, target_y_m: 0 } },
    ]);
  });

  it("sends session fields that moved (seq, clock, hash)", () => {
    const after = { ...base, session: { ...base.session, last_seq: 11, log_hash: "h2", clock: { ...base.session.clock, paused: true } } };
    expect(diffSnapshots(base, after).map((c) => c.path).sort()).toEqual(["session/clock", "session/last_seq", "session/log_hash"]);
  });

  it("an item changed in a list of the same items goes by path; a task and an acked alert", () => {
    const b = { ...base, alerts: [alert], tasks: [task] };
    const after = { ...b, alerts: [{ ...alert, acked_seq: 12, acked_by: "ops" as const }], tasks: [{ ...task, state: "DONE" as const }] };
    expect(diffSnapshots(b, after)).toEqual([
      { path: "alerts/a-1/acked_seq", value: 12 },
      { path: "alerts/a-1/acked_by", value: "ops" },
      { path: "tasks/t-1/state", value: "DONE" },
    ]);
  });

  it("a list that gained, lost or reordered items is sent whole", () => {
    const two = { ...alert, alert_id: "a-2" };
    expect(diffSnapshots(base, { ...base, alerts: [alert] })).toEqual([{ path: "alerts", value: [alert] }]);
    expect(diffSnapshots({ ...base, alerts: [alert] }, base)).toEqual([{ path: "alerts", value: [] }]);
    expect(diffSnapshots({ ...base, alerts: [alert, two] }, { ...base, alerts: [two, alert] })).toEqual([{ path: "alerts", value: [two, alert] }]);
  });

  it("an id with a path separator forces the whole list", () => {
    const odd = { ...task, task_id: "t/1" };
    expect(diffSnapshots({ ...base, tasks: [odd] }, { ...base, tasks: [{ ...odd, state: "DONE" as const }] })).toEqual([{ path: "tasks", value: [{ ...odd, state: "DONE" }] }]);
  });

  it("a changed plan or earth goes whole", () => {
    expect(diffSnapshots(base, { ...base, earth: { ...base.earth, blackout: true } })).toEqual([{ path: "earth", value: { ...base.earth, blackout: true } }]);
  });
});
