/**
 * T32.06 (backend package 04): the reshaped loader and the plan-less session (05 Scenario, Session;
 * 02 §E.7, §D.17; FR-52, FR-53, FR-54, NFR-06, NFR-10; decisions BD-78, BD-100, BD-101). One named test
 * per rule. Every case copies the fake scenario folder (F8, T32.05) to a temporary folder and breaks
 * one thing; the committed fixtures are never edited. A site with candidates is the fixture
 * `two-candidate-site/` (manifest and grid) plus the POIs of `data/sites/mock_site`.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { LogEvent, PlanExport, Scenario, Site } from "@marswalk/protocol";
import { canonicalJson } from "../src/log";
import { replayHeadless } from "../src/replay";
import { loadCandidateComm, loadSite, readScenario, ScenarioCheckError, type LoadedScenario, type SiteRef } from "../src/scenario";
import { loadSession } from "../src/session";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures/fake-scenario");
const REPO_ROOT = join(here, "../../..");
const MOCK_SITE_DIR = join(REPO_ROOT, "data/sites/mock_site");
const SITE_VERSION = "mock_site-2026.11.05";
const NO_SITE: SiteRef = { site_id: "mock_site", data_version: "mock_site-fixture", dir: null };

const dirs: string[] = [];
const tmp = (prefix: string): string => {
  const d = mkdtempSync(join(tmpdir(), `marswalk-${prefix}-`));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/** A copy of the fixture folder whose `scenario.json` is the plan-less variant (or the reference), edited by `edit`. */
function copyWith(edit: (s: Scenario) => void = () => {}, opts: { planless?: boolean; version?: string } = {}): string {
  const dir = tmp("scenario-live");
  cpSync(fixtureDir, dir, { recursive: true });
  const source = join(dir, opts.planless === false ? "scenario.json" : "scenario.planless.json");
  const scenario = readJson<Scenario>(source);
  if (opts.version) scenario.data_version = opts.version;
  edit(scenario);
  writeFileSync(join(dir, "scenario.json"), `${JSON.stringify(scenario, null, 2)}\n`);
  return dir;
}

/** The fixture's two-candidate site manifest and grid, with the POIs of the mock site: a complete site folder. */
function candidateSite(editManifest: (m: Site) => void = () => {}): SiteRef {
  const dir = tmp("site");
  cpSync(join(fixtureDir, "two-candidate-site"), dir, { recursive: true });
  cpSync(join(MOCK_SITE_DIR, "vectors"), join(dir, "vectors"), { recursive: true });
  const path = join(dir, "site-manifest.json");
  const manifest = readJson<Site>(path);
  editManifest(manifest);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  return { site_id: "mock_site", data_version: SITE_VERSION, dir };
}

const MOCK_SITE: SiteRef = { site_id: "mock_site", data_version: SITE_VERSION, dir: MOCK_SITE_DIR };

function rejection(dir: string, site: SiteRef): ScenarioCheckError {
  try {
    readScenario(dir, site);
  } catch (err) {
    expect(err).toBeInstanceOf(ScenarioCheckError);
    return err as ScenarioCheckError;
  }
  throw new Error("expected readScenario to reject");
}

const stopTask = { task_id: "t-1", stop_id: "wp-1", crew_id: null, kind: "other" as const, text: "Fixture task" };

describe("reshaped loader (T32.06 step 1; T32.07, T32.08)", () => {
  it("loads a scenario with no plan and no events; events read as an empty list", () => {
    const loaded = readScenario(copyWith(), NO_SITE);
    expect(loaded.scenario.plan).toBeUndefined();
    expect(loaded.scenario.events).toEqual([]);
    expect(loaded.scenario.scenario_id).toBe("fake-planless");
  });

  it("rejects stop_tasks without a plan", () => {
    const dir = copyWith((s) => {
      s.stop_tasks = [stopTask];
    });
    const err = rejection(dir, NO_SITE);
    // The schema's dependentRequired refuses it before the loader's own checks (05 Scenario: stop_tasks requires plan).
    expect(err.check).toBe("schema");
    expect(err.message).toMatch(/plan/);
  });

  it("rejects mission_setup.crew_count that differs from crew[]", () => {
    const err = rejection(
      copyWith((s) => {
        s.mission_setup.crew_count = 1;
      }),
      NO_SITE,
    );
    expect(err.check).toBe("mission_setup_crew_count");
    expect(err.message).toMatch(/crew_count 1.*2/);
  });

  it("rejects vehicle_available true without vehicle_param_set", () => {
    const err = rejection(
      copyWith((s) => {
        s.mission_setup.vehicle_available = true;
        delete (s.mission_setup as Record<string, unknown>).vehicle_param_set;
      }),
      NO_SITE,
    );
    expect(err.check).toBe("mission_setup_vehicle");
  });

  it("rejects a mission_setup vehicle_param_set that is not listed, or is not a pressurized rover", () => {
    expect(
      rejection(
        copyWith((s) => {
          s.mission_setup.vehicle_param_set = "pr9-assumed";
        }),
        NO_SITE,
      ).check,
    ).toBe("param_set_unlisted");
    expect(
      rejection(
        copyWith((s) => {
          s.mission_setup.vehicle_param_set = "suit-assumed";
        }),
        NO_SITE,
      ).check,
    ).toBe("mission_setup_vehicle");
  });

  it("rejects a mission_setup value outside the 02 §E.3 range (max_haven_min 5-120)", () => {
    const err = rejection(
      copyWith((s) => {
        s.mission_setup.max_haven_min = 4;
      }),
      NO_SITE,
    );
    expect(err.check).toBe("schema");
    expect(err.message).toMatch(/max_haven_min/);
  });

  it("rejects a hab_candidate_id that is not in the Site's hab_candidates", () => {
    const err = rejection(
      copyWith(
        (s) => {
          s.mission_setup.hab_candidate_id = "hab-nowhere";
        },
        { version: SITE_VERSION },
      ),
      candidateSite(),
    );
    expect(err.check).toBe("hab_candidate");
    expect(err.message).toMatch(/hab-nowhere/);
  });

  it("rejects a missing hab_candidate_id when the Site has candidates", () => {
    const err = rejection(
      copyWith(
        (s) => {
          delete s.mission_setup.hab_candidate_id;
        },
        { version: SITE_VERSION },
      ),
      candidateSite(),
    );
    expect(err.check).toBe("hab_candidate");
  });

  it("accepts a hab_candidate_id of the Site, and the second candidate too", () => {
    for (const id of ["hab-first", "hab-alternative"]) {
      const loaded = readScenario(copyWith((s) => void (s.mission_setup.hab_candidate_id = id), { version: SITE_VERSION }), candidateSite());
      expect(loaded.scenario.mission_setup.hab_candidate_id).toBe(id);
    }
  });

  it("rejects a hab_candidate_id when the Site has no candidates, and accepts it omitted", () => {
    const withId = copyWith((s) => void (s.mission_setup.hab_candidate_id = "hab-first"), { version: SITE_VERSION });
    expect(rejection(withId, MOCK_SITE).check).toBe("hab_candidate");
    const omitted = copyWith((s) => void delete s.mission_setup.hab_candidate_id, { version: SITE_VERSION });
    expect(readScenario(omitted, MOCK_SITE).scenario.mission_setup.hab_candidate_id).toBeUndefined();
  });

  it("rejects an event_library dose_series that is not a key in tables", () => {
    const err = rejection(
      copyWith((s) => {
        (s.event_library[0] as unknown as Record<string, unknown>).dose_series = "dose_series_2";
      }),
      NO_SITE,
    );
    expect(err.check).toBe("event_library_dose_series");
  });

  it("rejects an event_library series_start_utc that is not a sample time of its series", () => {
    const err = rejection(
      copyWith((s) => {
        s.event_library[0].series_start_utc = "2024-05-20T00:01:00Z";
      }),
      NO_SITE,
    );
    expect(err.check).toBe("event_library_series_start");
  });

  it("rejects a duplicate event_id in the event_library", () => {
    const err = rejection(
      copyWith((s) => {
        s.event_library.push({ ...s.event_library[0] });
      }),
      NO_SITE,
    );
    expect(err.check).toBe("event_library_id");
  });

  it("rejects a negative event_library input offset", () => {
    const err = rejection(
      copyWith((s) => {
        s.event_library[0].inputs = [{ input_id: "i1", t_offset_s: -1, kind: "ADVISORY", payload: {}, provenance: "simulated" }];
      }),
      NO_SITE,
    );
    expect(err.check).toBe("schema");
    expect(err.message).toMatch(/t_offset_s/);
  });

  it("exposes the validated event_library and task_library on the LoadedScenario", () => {
    const loaded = readScenario(copyWith(), NO_SITE);
    expect(loaded.eventLibrary.map((e) => e.event_id)).toEqual(["storm"]);
    expect(loaded.taskLibrary.map((t) => t.library_task_id)).toEqual(["lt-boxwork-01", "lt-boxwork-02"]);
  });

  it("rejects a task_library poi_id that is not a POI of the Site", () => {
    const err = rejection(
      copyWith(
        (s) => {
          delete s.mission_setup.hab_candidate_id; // the mock site has no candidates
          s.task_library![0].poi_id = "poi-nowhere";
        },
        { version: SITE_VERSION },
      ),
      MOCK_SITE,
    );
    expect(err.check).toBe("task_library_poi");
    expect(err.message).toMatch(/poi-nowhere/);
  });

  it("rejects more than four task_library entries for one POI (FR-50 range; an unused POI has none)", () => {
    const err = rejection(
      copyWith(
        (s) => {
          delete s.mission_setup.hab_candidate_id; // the mock site has no candidates
          const base = s.task_library![0];
          s.task_library = [1, 2, 3, 4, 5].map((n) => ({ ...base, library_task_id: `lt-x-${n}`, text: "Observe the ridge" }));
        },
        { version: SITE_VERSION },
      ),
      MOCK_SITE,
    );
    expect(err.check).toBe("task_library_count");
  });

  it("rejects task_library text over 60 characters", () => {
    const err = rejection(
      copyWith((s) => {
        s.task_library![0].text = "x".repeat(61);
      }),
      NO_SITE,
    );
    expect(err.check).toBe("schema");
    expect(err.message).toMatch(/text/);
  });

  it("rejects task_library text that contains a digit when source_id is missing (BD-101), and accepts it with one", () => {
    const err = rejection(
      copyWith((s) => {
        s.task_library![0].text = "Image 3 spots on the ridge";
      }),
      NO_SITE,
    );
    expect(err.check).toBe("task_library_source");
    const loaded = readScenario(
      copyWith((s) => {
        s.task_library![0].text = "Image 3 spots on the ridge";
        s.task_library![0].source_id = "fixture-synthetic";
      }),
      NO_SITE,
    );
    expect(loaded.taskLibrary[0].source_id).toBe("fixture-synthetic");
  });

  it("rejects duplicate library_task_id values", () => {
    const err = rejection(
      copyWith((s) => {
        s.task_library![1].library_task_id = s.task_library![0].library_task_id;
      }),
      NO_SITE,
    );
    expect(err.check).toBe("task_library_id");
  });
});

describe("TI sidecar dimensions (BD-78, pipeline/src/marswalk_pipeline/grid.py)", () => {
  const ti = (m: Site) => m.assets.find((a) => a.asset_id === "grid-ti")!;
  const loadWith = (edit: (m: Site) => void): void => {
    const site = candidateSite(edit);
    loadSite(site.dir!, "mock_site", SITE_VERSION);
  };

  it("loads a TI sidecar whose width x height x 4 is its file length", () => {
    expect(() => loadWith(() => {})).not.toThrow();
  });

  it("rejects a TI asset without width and height (the manifest schema, before the loader)", () => {
    expect(() =>
      loadWith((m) => {
        delete ti(m).width;
        delete ti(m).height;
      }),
    ).toThrow(expect.objectContaining({ check: "site_manifest" })); // the manifest schema already requires both on an f32 asset
  });

  it("rejects a TI width x height over the 4e6-cell limit of the grid writer", () => {
    expect(() =>
      loadWith((m) => {
        ti(m).width = 4001;
        ti(m).height = 1000;
      }),
    ).toThrow(expect.objectContaining({ check: "grid_dims", message: expect.stringMatching(/4000000/) }));
  });

  it("rejects a TI width x height that does not fill its file", () => {
    expect(() =>
      loadWith((m) => {
        ti(m).height = 59;
      }),
    ).toThrow(expect.objectContaining({ check: "grid_dims" }));
  });
});

describe("loadCandidateComm (T32.08 step 4; T03.37 asset naming)", () => {
  it("reads rank 1 from grid-comm-hab and the others from grid-comm-<candidate_id>, with each candidate's mast", () => {
    const site = candidateSite();
    const first = loadCandidateComm(site, "hab-first");
    const alt = loadCandidateComm(site, "hab-alternative");
    expect(first.hab_mast).toEqual({ x_m: -1800, y_m: -1500, height_m: 10 });
    expect(alt.hab_mast).toEqual({ x_m: 1800, y_m: -1500, height_m: 10 });
    expect(first.comm_hab).toHaveLength(60 * 60);
    expect(Buffer.from(first.comm_hab).equals(Buffer.from(alt.comm_hab))).toBe(false);
    // The fixture says the second grid is the first one mirrored left to right.
    // No-data cells (255) stay where they are in the fixture; every other cell is the mirror image.
    for (let row = 0; row < 60; row++) {
      for (let col = 0; col < 60; col++) {
        const mirrored = first.comm_hab[row * 60 + (59 - col)]!;
        if (mirrored !== 255 && first.comm_hab[row * 60 + col] !== 255) expect(alt.comm_hab[row * 60 + col]).toBe(mirrored);
      }
    }
  });

  it("rejects an unknown candidate, and a candidate whose grid file does not match its SHA-256", () => {
    const site = candidateSite();
    expect(() => loadCandidateComm(site, "hab-nowhere")).toThrow(expect.objectContaining({ check: "hab_candidate" }));
    const file = join(site.dir!, "grid/comm_hab-alternative.u8");
    const bytes = readFileSync(file);
    bytes[0] = bytes[0] === 0 ? 1 : 0;
    writeFileSync(file, bytes);
    expect(() => loadCandidateComm(site, "hab-alternative")).toThrow(expect.objectContaining({ check: "grid_sha256" }));
  });

  it("a site without hab_candidates has only the unnamed rank-1 grid, so a named candidate is unknown", () => {
    expect(() => loadCandidateComm(MOCK_SITE, "hab-first")).toThrow(expect.objectContaining({ check: "hab_candidate" }));
  });
});

// ---------------------------------------------------------------------------
// Plan-less session (T32.06 step 2)
// ---------------------------------------------------------------------------

/** The fixture plan under the candidate site's data_version, with its plan_hash recomputed (05 PlanExport). */
function planFor(version: string): PlanExport {
  const plan = structuredClone(readJson<Scenario>(join(fixtureDir, "scenario.json")).plan!);
  plan.data_version = version;
  plan.plan_hash = sha256(canonicalJson({ data_version: plan.data_version, scenario: plan.scenario, waypoints: plan.waypoints })).slice(0, 12);
  return plan;
}

function liveSession(candidate: string | null = "hab-first"): { loaded: LoadedScenario; handle: ReturnType<typeof loadSession> } {
  const loaded = readScenario(
    copyWith(
      (s) => {
        if (candidate === null) delete s.mission_setup.hab_candidate_id;
        else s.mission_setup.hab_candidate_id = candidate;
      },
      { version: SITE_VERSION },
    ),
    candidate === null ? MOCK_SITE : candidateSite(),
  );
  return { loaded, handle: loadSession(loaded, tmp("var")) };
}

const ops = (command_id: string, kind: "START_EVA" | "PUBLISH_PLAN", args: Record<string, unknown> = {}) => ({ command_id, role: "ops" as const, kind, args });

describe("plan-less session (T32.06 step 2; BD-100)", () => {
  it("starts in LOADED with plan null and the live Session fields filled", () => {
    const { handle } = liveSession();
    const snap = handle.snapshot([]);
    expect(snap.session.status).toBe("LOADED");
    expect(snap.plan).toBeNull();
    expect(snap.session.hab_candidate_id).toBe("hab-first");
    expect(snap.session.mission_setup).toEqual({ crew_count: 2, vehicle_available: true, vehicle_param_set: "pr1-assumed", solar_phase: "max", max_haven_min: 30 });
    expect(snap.session.started_events).toEqual([]);
    expect(snap.task_library.length).toBe(2);
    expect(snap.event_library.map((e) => e.event_id)).toEqual(["storm"]);
  });

  it("SESSION_LOADED has plan_hash null", () => {
    const { handle } = liveSession();
    const first = handle.eventsAfter(0)[0] as LogEvent;
    expect(first.kind).toBe("SESSION_LOADED");
    expect(first.data).toMatchObject({ scenario_id: "fake-planless", plan_hash: null });
  });

  it("puts the crew at the chosen candidate's default_start", () => {
    const first = liveSession("hab-first").handle.snapshot([]);
    expect(first.crew.map((c) => [c.x_m, c.y_m])).toEqual([
      [-1800, -1500],
      [-1800, -1500],
    ]);
    const alt = liveSession("hab-alternative").handle.snapshot([]);
    expect(alt.crew.map((c) => [c.x_m, c.y_m])).toEqual([
      [1800, -1500],
      [1800, -1500],
    ]);
    expect(alt.session.hab_candidate_id).toBe("hab-alternative");
  });

  it("with no candidates the crew start at the Site's default_start and hab_candidate_id is null", () => {
    const { handle } = liveSession(null);
    const snap = handle.snapshot([]);
    const site = readJson<Site>(join(MOCK_SITE_DIR, "site-manifest.json"));
    expect(snap.crew.every((c) => c.x_m === site.default_start.x_m && c.y_m === site.default_start.y_m)).toBe(true);
    expect(snap.session.hab_candidate_id).toBeNull();
  });

  it("advancing a LOADED plan-less session moves nothing", () => {
    const { handle } = liveSession();
    expect(handle.advance(60)).toEqual({ events: [], deltas: [] });
    expect(handle.snapshot([]).sim_time).toBe("2024-05-20T00:00:00Z");
  });

  it("START_EVA is INVALID until a plan is published, and the session stays in LOADED", () => {
    const { handle } = liveSession();
    const r = handle.apply(ops("c1", "START_EVA")).result;
    expect(r).toMatchObject({ ok: false, code: "INVALID" });
    expect(handle.snapshot([]).session.status).toBe("LOADED");
  });

  it("PUBLISH_PLAN then starts a normal run: the crew walk the published plan", () => {
    const { handle } = liveSession();
    const plan = planFor(SITE_VERSION);
    expect(handle.apply(ops("c2", "PUBLISH_PLAN", { plan })).result.ok).toBe(true);
    const published = handle.snapshot([]);
    expect(published.plan?.plan_hash).toBe(plan.plan_hash);
    expect(published.session.status).toBe("LOADED");
    expect(handle.apply(ops("c3", "START_EVA")).result.ok).toBe(true);
    const before = handle.snapshot([]).crew.map((c) => [c.x_m, c.y_m]);
    handle.advance(30);
    const after = handle.snapshot([]);
    expect(after.session.status).toBe("RUNNING");
    expect(after.crew.map((c) => [c.x_m, c.y_m])).not.toEqual(before);
    expect(after.crew.every((c) => c.activity === "WALKING")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Replay, reference scenario unchanged (T32.06 step 3)
// ---------------------------------------------------------------------------

describe("replay and the reference scenario (T32.06 step 3, T32.07)", () => {
  it("a plan-less scenario cannot be replayed without a command list: exit code 2 and a clear message", async () => {
    const dir = copyWith(
      (s) => {
        delete s.mission_setup.hab_candidate_id;
      },
      { version: SITE_VERSION },
    );
    await expect(replayHeadless(dir, undefined, { site: MOCK_SITE, varDir: tmp("var") })).rejects.toThrow("scenario has no plan; pass --commands with a PUBLISH_PLAN");
    const r = spawnSync(join(REPO_ROOT, "node_modules/.bin/tsx"), [join(REPO_ROOT, "apps/hab-core/src/cli.ts"), "replay", dir], { encoding: "utf8", cwd: REPO_ROOT });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("scenario has no plan; pass --commands with a PUBLISH_PLAN");
  }, 30_000);

  it("replays the fake scenario with its plan: the reference run presses the storm at series_start_utc (T32.12)", async () => {
    const hash = await replayHeadless(fixtureDir, undefined, { site: NO_SITE, varDir: tmp("var") });
    // Before T32.12 the hash was d75066e6…ddd7 (33b1ecb, the storm in table time). The replay now presses START_EVENT at
    // series_start_utc (U-62, BD-97), which adds one EVENT_STARTED line and the shifted alert_id (a-11 → a-12), and the
    // RADIATION_ALERT text is "Shelter now — radiation surge" (N-17). Every other event, time and number is the old one
    // (checked by diffing the two logs without that line). Any engine change that moves it needs a reason next to the value.
    expect(hash).toBe("1e7f9a1a5a61a11eabf4d9cf13c1a74ade1d2c1f2cb1749b9bc0b1bb403f61dc");
  });
});
