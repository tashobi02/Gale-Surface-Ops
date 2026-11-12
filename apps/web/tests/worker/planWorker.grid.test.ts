/**
 * T07.08 / BD-40 — the real worker adapter accepts LOAD_GRID and from then on answers requests instead of GRID_NOT_LOADED
 * (02 §E.2). No mock of @marswalk/compute here: the real handler routes over the F4 mock site grid.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LoadGridRequest, SamplePointRequest } from "@marswalk/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockManifest } from "../ui/map/mapFixtures";

const DIR = resolve(__dirname, "../../../../data/sites/mock_site");
const manifest = mockManifest();
const buf = (rel: string): ArrayBuffer => {
  const b = readFileSync(resolve(DIR, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const asset = (id: string): string => manifest.assets.find((a) => a.asset_id === id)!.path;
const g = manifest.grid;

function loadRequest(over: Partial<LoadGridRequest> = {}): LoadGridRequest {
  return {
    type: "LOAD_GRID",
    request_id: "req-grid",
    site_id: manifest.site_id,
    data_version: manifest.data_version,
    meta: { ...g, proj4: manifest.crs.proj4 },
    arrays: {
      elevation: buf(asset(g.elevation_asset)),
      slopeP90: buf(asset(g.slope_p90_asset)),
      slopeMax: buf(asset(g.slope_max_asset)),
      flags: buf(asset(g.flags_asset)),
      ti: buf(asset(g.ti_asset!)),
      commHab: buf(asset(g.comm_hab_asset)),
    },
    ...over,
  };
}

const sample: SamplePointRequest = { type: "SAMPLE_POINT", request_id: "req-sample", x_m: -1800, y_m: -1500, snap_radius_m: 50 };

async function freshAdapter() {
  vi.resetModules();
  return import("../../src/worker/planWorker");
}

describe("planWorker LOAD_GRID (BD-40)", () => {
  let adapter: Awaited<ReturnType<typeof freshAdapter>>;
  beforeEach(async () => {
    adapter = await freshAdapter();
  });

  it("before LOAD_GRID a request is answered GRID_NOT_LOADED", () => {
    expect(adapter.handleMessage(sample)).toMatchObject({ type: "ERROR", code: "GRID_NOT_LOADED", request_id: "req-sample" });
  });

  it("LOAD_GRID is answered GRID_LOADED with the site and data version, and the next SAMPLE_POINT is no longer GRID_NOT_LOADED", () => {
    expect(adapter.handleMessage(loadRequest())).toEqual({
      type: "GRID_LOADED",
      request_id: "req-grid",
      site_id: manifest.site_id,
      data_version: manifest.data_version,
    });
    const answer = adapter.handleMessage(sample);
    expect(answer.type).toBe("SAMPLE_RESULT");
  });

  it("a thermal-inertia-free load (ti: null) is accepted", () => {
    const request = loadRequest();
    request.arrays.ti = null;
    expect(adapter.handleMessage(request).type).toBe("GRID_LOADED");
  });

  it("a buffer whose size does not match the grid is an INVALID_INPUT error naming it, and the worker stays unloaded", () => {
    const request = loadRequest();
    request.arrays.slopeP90 = new ArrayBuffer(3);
    expect(adapter.handleMessage(request)).toMatchObject({ type: "ERROR", code: "INVALID_INPUT", request_id: "req-grid", message: expect.stringContaining("slopeP90") });
    expect(adapter.handleMessage(sample)).toMatchObject({ code: "GRID_NOT_LOADED" });
  });
});
