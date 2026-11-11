/**
 * T22.13: headless replay (NFR-06, NFR-14). tick (T22.09) is still a stub, so it is replaced by the
 * same declared stand-in as in session.test.ts: EV1 walks +1 m per step and arrives at stop 1 at
 * t = 30 s. Two runs of the same scenario and seed must give the same log_hash.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineState } from "../src/engine/reducer";
import type { TickResult } from "../src/engine/tick";
import { replayHeadless, siteRefFor } from "../src/replay";
import { ScenarioCheckError } from "../src/scenario";

vi.mock("../src/engine/tick", async () => {
  const { logged, reduce } = await vi.importActual<typeof import("../src/engine/reducer")>("../src/engine/reducer");
  return {
    tick(state: EngineState, _scenario: unknown, dt_s: number, next_seq: number): TickResult {
      const t_s = (Date.parse(state.session.clock.sim_time) - Date.parse("2024-05-20T00:00:00Z")) / 1000;
      const ev1 = state.crew.find((c) => c.crew_id === "EV1")!;
      let next = ev1.activity === "WALKING" ? { ...state, crew: state.crew.map((c) => (c.crew_id === "EV1" ? { ...c, x_m: c.x_m + dt_s } : c)) } : state;
      const events = [];
      if (t_s === 30) {
        const pending = { sim_time: state.session.clock.sim_time, kind: "ARRIVED_STOP" as const, actor: "system" as const, data: { crew_id: "EV1", stop_id: "wp-1", stop_index: 1 }, provenance: {} };
        next = reduce(next, logged(pending, next_seq));
        events.push(pending);
      }
      return { state: next, events, deltas: [] };
    },
  };
});

const here = dirname(fileURLToPath(import.meta.url));
const scenarioDir = join(here, "fixtures/fake-scenario");
const site = { site_id: "mock_site", data_version: "mock_site-fixture", dir: null };

const dirs: string[] = [];
const varDir = (): string => {
  const d = mkdtempSync(join(tmpdir(), "marswalk-replay-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("replayHeadless (T22.13, NFR-14)", () => {
  it("prints a SHA-256 log_hash", async () => {
    expect(await replayHeadless(scenarioDir, undefined, { site, varDir: varDir() })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("two runs of the same scenario and seed give the same log_hash (NFR-06)", async () => {
    const a = await replayHeadless(scenarioDir, undefined, { site, varDir: varDir() });
    const b = await replayHeadless(scenarioDir, undefined, { site, varDir: varDir() });
    expect(b).toBe(a);
  });

  it("--seed replaces the scenario seed, so the log (SESSION_LOADED) and its hash change", async () => {
    const a = await replayHeadless(scenarioDir, undefined, { site, varDir: varDir() });
    const b = await replayHeadless(scenarioDir, 1, { site, varDir: varDir() });
    expect(b).not.toBe(a);
  });

  it("a scenario for another data_version is rejected before anything runs", async () => {
    await expect(replayHeadless(scenarioDir, undefined, { site: { ...site, data_version: "mock_site-2026.11.05" }, varDir: varDir() })).rejects.toBeInstanceOf(ScenarioCheckError);
  });

  it("the site reference comes from data/sites/<site_id>/site-manifest.json", () => {
    expect(siteRefFor("mock_site")).toMatchObject({ site_id: "mock_site", data_version: expect.stringMatching(/^mock_site-/) });
    expect(() => siteRefFor("no_such_site")).toThrow(ScenarioCheckError);
  });
});
