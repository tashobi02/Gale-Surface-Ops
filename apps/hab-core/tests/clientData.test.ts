/**
 * Two read-only endpoints the clients asked for (N-30, N-100/N-120; backend package 30, BD-158, BD-159):
 *
 * - `GET /api/scenario-meta`: the loaded scenario's own metadata for SCR-09 (Sources and methods): its ParamSets with values,
 *   provenance and source ids, the dose series it replays (source id, the event library's title for it, method, unit, span,
 *   sample count) and the Earth-link table's span and kernel source ids. Everything is read from the loaded files; nothing is
 *   computed or typed here. 404 with no session.
 * - `GET /api/hab-time-field`: the walking time to the hab for every cell of the routing grid (compute `habTimeField`, the field
 *   the haven tick uses), as little-endian float32 seconds (Infinity = unreachable), row 0 = north, with the grid geometry,
 *   unit and provenance in headers, so the ops map and the EVA map can draw the 10/20/30 min isochrones. 404 with no session,
 *   no plan, no grid or no start waypoint; `ETag` from the inputs, 304 on a match.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { habTimeField } from "@marswalk/compute";
import { scenarioMeta } from "../src/scenarioMeta";
import { startServer } from "../src/server";
import { loadSession } from "../src/session";
import { readScenario, type LoadedScenario } from "../src/scenario";
import { havenFlat } from "../../../packages/compute/tests/fixtures/v2grids";

const here = dirname(fileURLToPath(import.meta.url));
const fake = readScenario(join(here, "fixtures/fake-scenario"), { site_id: "mock_site", data_version: "mock_site-fixture", dir: null });
const fx = havenFlat(10);
const withGrid: LoadedScenario = { ...fake, grid: fx.grid };

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanup.length > 0) await cleanup.pop()!();
});
async function serve(scenario: LoadedScenario | null) {
  const dir = mkdtempSync(join(tmpdir(), "marswalk-clientdata-"));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const session = scenario === null ? undefined : loadSession(scenario, dir);
  const server = await startServer({ site: "mock_site", port: 0, host: "127.0.0.1", ...(session === undefined ? {} : { session }) });
  cleanup.push(() => server.close());
  return { server, session };
}

describe("scenarioMeta (N-30, BD-158)", () => {
  const meta = scenarioMeta(fake);

  it("lists every loaded ParamSet, by id, with its values, provenance and source ids as loaded", () => {
    expect(meta.param_sets.map((p) => p.param_set_id)).toEqual(Object.keys(fake.params).sort());
    for (const p of meta.param_sets) expect(p).toEqual(fake.params[p.param_set_id]);
    expect(meta.param_sets.length).toBeGreaterThan(0);
  });

  it("names the dose series with the title the scenario's event library gives its source, and its span and size", () => {
    const entry = fake.eventLibrary.find((e) => e.source_id === fake.dose.source_id)!;
    expect(meta.dose_series).toEqual({
      series_id: fake.dose.series_id,
      source_id: fake.dose.source_id,
      title: entry.title,
      label: entry.label,
      method: fake.dose.method,
      quantity: fake.dose.quantity,
      unit: fake.dose.unit,
      provenance: "replayed",
      background_rate_ugy_h: fake.dose.background_rate,
      first_utc: fake.dose.samples[0]![0],
      last_utc: fake.dose.samples.at(-1)![0],
      sample_count: fake.dose.samples.length,
    });
  });

  it("title and label are null when no event of the library draws on the series' source (never made up)", () => {
    const m = scenarioMeta({ ...fake, eventLibrary: [] });
    expect(m.dose_series).toMatchObject({ source_id: fake.dose.source_id, title: null, label: null });
  });

  it("describes the Earth-link table: step, first and last row, kernel source ids (sorted, unique)", () => {
    expect(meta.earth_link).toEqual({
      step_s: fake.earthLink.step_s,
      first_utc: fake.earthLink.rows[0]!.t_utc,
      last_utc: fake.earthLink.rows.at(-1)!.t_utc,
      kernel_source_ids: [...new Set(fake.earthLink.kernels.map((k) => k.source_id))].sort(),
      provenance: "derived",
    });
  });

  it("carries the scenario id, title, data version and the source ids it draws on", () => {
    expect(meta).toMatchObject({ scenario_id: fake.scenario.scenario_id, title: fake.scenario.title, data_version: fake.scenario.data_version, source_ids: fake.scenario.source_ids });
  });
});

describe("GET /api/scenario-meta (N-30)", () => {
  it("is 404 with no session", async () => {
    const { server } = await serve(null);
    expect((await fetch(`${server.url}/api/scenario-meta`)).status).toBe(404);
  });

  it("serves the metadata of the loaded scenario as JSON", async () => {
    const { server } = await serve(fake);
    const res = await fetch(`${server.url}/api/scenario-meta`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual(JSON.parse(JSON.stringify(scenarioMeta(fake))));
  });
});

describe("GET /api/hab-time-field (N-100, N-120)", () => {
  const hab = withGrid.scenario.plan!.waypoints.find((w) => w.role === "start")!;
  const field = habTimeField(fx.grid, hab, withGrid.scenario.plan!.scenario);

  it("is 404 with no session, and with a scenario that has no routing grid", async () => {
    expect((await fetch(`${(await serve(null)).server.url}/api/hab-time-field`)).status).toBe(404);
    expect((await fetch(`${(await serve(fake)).server.url}/api/hab-time-field`)).status).toBe(404);
  });

  it("serves compute's field: float32 seconds per cell, Infinity where unreachable, with the grid geometry in headers", async () => {
    const { server } = await serve(withGrid);
    const res = await fetch(`${server.url}/api/hab-time-field`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/octet-stream");
    expect(res.headers.get("x-grid-width")).toBe(String(field.width));
    expect(res.headers.get("x-grid-height")).toBe(String(field.height));
    expect(res.headers.get("x-grid-origin-m")).toBe(field.origin_m.join(","));
    expect(res.headers.get("x-grid-cell-m")).toBe(String(field.cell_m));
    expect(res.headers.get("x-unit")).toBe("s");
    expect(res.headers.get("x-provenance")).toBe("modelled");
    expect(res.headers.get("x-data-version")).toBe(withGrid.scenario.data_version);
    const body = new Float32Array(await res.arrayBuffer());
    expect(body.length).toBe(field.width * field.height);
    expect(body).toEqual(Float32Array.from(field.seconds));
    expect(body.some((s) => s === 0)).toBe(true); // the hab cell
    expect(body.some((s) => s > 0 && Number.isFinite(s))).toBe(true);
  });

  it("answers a matching If-None-Match with 304, and a different one with the field", async () => {
    const { server } = await serve(withGrid);
    const first = await fetch(`${server.url}/api/hab-time-field`);
    const etag = first.headers.get("etag")!;
    expect(etag).toMatch(/^"[0-9a-f]{16}"$/);
    expect((await fetch(`${server.url}/api/hab-time-field`, { headers: { "If-None-Match": etag } })).status).toBe(304);
    expect((await fetch(`${server.url}/api/hab-time-field`, { headers: { "If-None-Match": '"other"' } })).status).toBe(200);
  });

  it("session.habTimeField is null for a scenario without a grid", () => {
    const dir = mkdtempSync(join(tmpdir(), "marswalk-clientdata-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    expect(loadSession(fake, dir).habTimeField?.()).toBeNull();
  });
});
