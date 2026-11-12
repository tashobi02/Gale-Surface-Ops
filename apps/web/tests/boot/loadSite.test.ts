/**
 * T07.02 — site loading (02 §E.1, 05 §E.1, 03 §D; FR-01, FR-16).
 * Uses the F4 mock site exactly as the pipeline wrote it, served through a stubbed fetch.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  BootError,
  DEFAULT_SITE_ID,
  loadSite,
  parseSiteManifest,
  resolveSiteId,
  SITE_REQUIRED_KEYS,
} from "../../src/boot/loadSite";
import { installDom, removeDom } from "../ui/domHarness";

const SITE_DIR = resolve(__dirname, "../../../../data/sites/mock_site");
const SCHEMA = resolve(__dirname, "../../../../schemas/site-manifest.schema.json");
const read = (relative: string): string => readFileSync(join(SITE_DIR, relative), "utf8");
const manifestJson = (): Record<string, unknown> => JSON.parse(read("site-manifest.json")) as Record<string, unknown>;

type Routes = Record<string, () => Response>;
const ok = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });
const notFound = (): Response => new Response("not found", { status: 404, statusText: "Not Found" });

/** Stub fetch with routes keyed by URL; any other URL is a 404. Returns the list of requested URLs. */
function stubFetch(routes: Routes): string[] {
  const requested: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      requested.push(input);
      return routes[input]?.() ?? notFound();
    }),
  );
  return requested;
}

function mockSiteRoutes(manifest: unknown = manifestJson()): Routes {
  return {
    "sites/mock_site/site-manifest.json": () => ok(manifest),
    "sites/mock_site/vectors/pois.geojson": () => ok(JSON.parse(read("vectors/pois.geojson"))),
  };
}

async function bootProblem(promise: Promise<unknown>): Promise<BootError["problem"]> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BootError);
  return (error as BootError).problem;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("T07.02 loadSite: the F4 mock site", () => {
  it("loads the manifest and POIs and finds every layer, source, asset and POI by id", async () => {
    stubFetch(mockSiteRoutes());
    const manifest = manifestJson() as { layers: { layer_id: string }[]; sources: { source_id: string }[]; assets: { asset_id: string; path: string }[] };
    const loaded = await loadSite("mock_site");

    expect(loaded.site.site_id).toBe("mock_site");
    expect([...loaded.layers.keys()].sort()).toEqual(manifest.layers.map((l) => l.layer_id).sort());
    expect([...loaded.sources.keys()].sort()).toEqual(manifest.sources.map((s) => s.source_id).sort());
    expect([...loaded.assets.keys()].sort()).toEqual(manifest.assets.map((a) => a.asset_id).sort());
    expect(loaded.pois.get("poi-boxwork-ridge")?.properties.name).toBe("Boxwork ridge");
  });

  it("keeps Asset.path as the manifest has it and adds a separate fetch url under the site folder", async () => {
    stubFetch(mockSiteRoutes());
    const loaded = await loadSite("mock_site");
    const asset = loaded.assets.get("grid-slope-p90");
    expect(asset?.path).toBe("grid/slope_p90.u8");
    expect(asset?.url).toBe("sites/mock_site/grid/slope_p90.u8");
    expect(loaded.assets.get("vec-pois")?.url).toBe("sites/mock_site/vectors/pois.geojson");
  });

  it("requests only relative site URLs (no absolute or external URL)", async () => {
    const requested = stubFetch(mockSiteRoutes());
    await loadSite("mock_site");
    expect(requested).toEqual(["sites/mock_site/site-manifest.json", "sites/mock_site/vectors/pois.geojson"]);
  });
});

describe("T07.02 loadSite: failures are BootProblems that name the file", () => {
  it("a missing manifest names it", async () => {
    stubFetch({});
    const problem = await bootProblem(loadSite("unknown_site"));
    expect(problem.code).toBe("MANIFEST_NOT_FOUND");
    expect(problem.missingFile).toBe("sites/unknown_site/site-manifest.json");
  });

  it("a network failure and invalid JSON are told apart", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect((await bootProblem(loadSite("mock_site"))).code).toBe("MANIFEST_LOAD_FAILED");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{not json", { status: 200 })));
    const problem = await bootProblem(loadSite("mock_site"));
    expect(problem.code).toBe("MANIFEST_PARSE_FAILED");
    expect(problem.missingFile).toBe("sites/mock_site/site-manifest.json");
  });

  it("a POI asset that cannot be fetched names its url", async () => {
    const routes = mockSiteRoutes();
    delete routes["sites/mock_site/vectors/pois.geojson"];
    stubFetch(routes);
    const problem = await bootProblem(loadSite("mock_site"));
    expect(problem.code).toBe("POI_ASSET_NOT_FOUND");
    expect(problem.missingFile).toBe("sites/mock_site/vectors/pois.geojson");
  });

  it("a pois_asset that no asset declares is a BootProblem; no path is guessed and nothing is fetched for it", async () => {
    const manifest = manifestJson() as { assets: { asset_id: string }[] };
    manifest.assets = manifest.assets.filter((a) => a.asset_id !== "vec-pois");
    const requested = stubFetch(mockSiteRoutes(manifest));
    const problem = await bootProblem(loadSite("mock_site"));
    expect(problem.code).toBe("POI_ASSET_UNRESOLVED");
    expect(problem.message).toContain("vec-pois");
    expect(requested).toEqual(["sites/mock_site/site-manifest.json"]);
  });

  it("a missing pois_asset field is an invalid manifest, not a default path", async () => {
    const manifest = manifestJson();
    delete manifest.pois_asset;
    const requested = stubFetch(mockSiteRoutes(manifest));
    const problem = await bootProblem(loadSite("mock_site"));
    expect(problem.code).toBe("MANIFEST_INVALID");
    expect(requested).toEqual(["sites/mock_site/site-manifest.json"]);
  });

  it("a POI file that is not a FeatureCollection of features with a poi_id is a BootProblem", async () => {
    const routes = mockSiteRoutes();
    routes["sites/mock_site/vectors/pois.geojson"] = () => ok({ type: "FeatureCollection", features: [{ type: "Feature", properties: {} }] });
    stubFetch(routes);
    const problem = await bootProblem(loadSite("mock_site"));
    expect(problem.code).toBe("POI_INVALID");
    expect(problem.missingFile).toBe("sites/mock_site/vectors/pois.geojson");
  });

  it("an asset path that leaves the site folder is rejected", async () => {
    const manifest = manifestJson() as { assets: { path: string }[] };
    manifest.assets[0].path = "../other_site/secret.bin";
    stubFetch(mockSiteRoutes(manifest));
    expect((await bootProblem(loadSite("mock_site"))).code).toBe("MANIFEST_INVALID");
  });

  it("a manifest whose site_id differs from the requested site is rejected", async () => {
    const manifest = manifestJson();
    manifest.site_id = "other_site";
    stubFetch(mockSiteRoutes(manifest));
    const problem = await bootProblem(loadSite("mock_site"));
    expect(problem.code).toBe("SITE_ID_MISMATCH");
  });
});

describe("T07.02 parseSiteManifest: validate, do not cast", () => {
  it("accepts the mock manifest and returns it unchanged", () => {
    const manifest = manifestJson();
    expect(parseSiteManifest(manifest)).toEqual(manifest);
  });

  it("requires exactly the top-level keys the C2 schema requires", () => {
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8")) as { required: string[] };
    expect([...SITE_REQUIRED_KEYS].sort()).toEqual([...schema.required].sort());
  });

  it.each(SITE_REQUIRED_KEYS)("rejects a manifest without %s and names it", (key) => {
    const manifest = manifestJson();
    delete manifest[key];
    expect(() => parseSiteManifest(manifest)).toThrow(BootError);
    try {
      parseSiteManifest(manifest);
    } catch (error) {
      const problem = (error as BootError).problem;
      expect(problem.code).toBe("MANIFEST_INVALID");
      expect(problem.message).toContain(key);
    }
  });

  it.each([
    ["not an object", [1, 2]],
    ["null", null],
    ["a string", "site"],
  ])("rejects %s", (_name, value) => {
    expect(() => parseSiteManifest(value)).toThrow(BootError);
  });

  it("rejects wrong types and shapes in the fields boot relies on, listing every problem", () => {
    const manifest = manifestJson() as Record<string, any>;
    manifest.site_id = "Bad Id";
    manifest.body = "earth";
    manifest.crs = { proj4: 3 };
    manifest.aoi = { extent_m: [0, 0, 1], bbox_geo: [0, 0, 1, 1] };
    manifest.layers = {};
    manifest.assets = [{ asset_id: 1, path: "a" }];
    let problem: BootError["problem"] | undefined;
    try {
      parseSiteManifest(manifest);
    } catch (error) {
      problem = (error as BootError).problem;
    }
    expect(problem?.code).toBe("MANIFEST_INVALID");
    for (const path of ["site_id", "body", "crs.proj4", "crs.base", "aoi.extent_m", "layers", "assets[0].asset_id"]) {
      expect(problem?.message, path).toContain(path);
    }
  });

  it("rejects duplicate layer, source and asset ids", () => {
    for (const [key, idKey] of [["layers", "layer_id"], ["sources", "source_id"], ["assets", "asset_id"]] as const) {
      const manifest = manifestJson() as Record<string, any>;
      manifest[key] = [...manifest[key], manifest[key][0]];
      expect(() => parseSiteManifest(manifest), `${key}.${idKey}`).toThrow(/duplicate/);
    }
  });

  it("checks a raster layer's tile_grid", () => {
    const manifest = manifestJson() as Record<string, any>;
    const raster = manifest.layers.find((l: any) => l.kind === "raster_tiles");
    raster.tile_grid = { origin_m: [0], resolutions_m: [], tile_size_px: 0, format: "gif" };
    expect(() => parseSiteManifest(manifest)).toThrow(/tile_grid/);
  });
});

describe("T07.02 resolveSiteId: ?site= is an allowlist (^[a-z0-9_]+$)", () => {
  it("uses the explicit id, then ?site=, then the default", () => {
    expect(resolveSiteId("", "gale_boxwork")).toBe("gale_boxwork");
    expect(resolveSiteId("?site=gale_boxwork")).toBe("gale_boxwork");
    expect(resolveSiteId("?debug=1&site=mock_site")).toBe("mock_site");
    expect(resolveSiteId("")).toBe("gale_boxwork");
  });

  it("default site is gale_boxwork, and ?site=mock_site is allowed (FD-086)", () => {
    expect(DEFAULT_SITE_ID).toBe("gale_boxwork");
    expect(resolveSiteId("?site=mock_site")).toBe("mock_site");
    expect(resolveSiteId("?site=gale_boxwork")).toBe("gale_boxwork");
  });

  it("a missing default bundle is a boot problem that names the manifest path (FD-086)", async () => {
    const requested = stubFetch({});
    const problem = await bootProblem(loadSite());
    expect(problem.code).toBe("MANIFEST_NOT_FOUND");
    expect(problem.missingFile).toBe("sites/gale_boxwork/site-manifest.json");
    expect(requested).toEqual(["sites/gale_boxwork/site-manifest.json"]);
  });

  it.each(["../x", "a/b", "Mock_Site", "mock-site", "mock site", "%2e%2e", "a.b", "site\n", ""])(
    "rejects the id %j",
    (id) => {
      const rejected = () => resolveSiteId(`?site=${encodeURIComponent(id)}`);
      if (id === "") {
        expect(rejected()).toBe("gale_boxwork"); // an empty parameter is no parameter
      } else {
        expect(rejected).toThrow(BootError);
        expect(() => resolveSiteId("", id)).toThrow(BootError);
      }
    },
  );

  it("loadSite refuses an invalid id before any fetch", async () => {
    const requested = stubFetch({});
    const problem = await bootProblem(loadSite("../../etc"));
    expect(problem.code).toBe("INVALID_SITE_ID");
    expect(requested).toEqual([]);
  });
});

describe("T07.02 loadSite reads ?site= from the page URL", () => {
  beforeAll(() => installDom());
  afterAll(() => removeDom());

  it("honours a valid ?site= and refuses an invalid one", async () => {
    const requested = stubFetch({});
    window.history.pushState({}, "", "/?site=gale_boxwork");
    await bootProblem(loadSite()); // no such stub route: 404, which is fine here
    expect(requested[0]).toBe("sites/gale_boxwork/site-manifest.json");

    requested.length = 0;
    window.history.pushState({}, "", "/?site=..%2Fetc");
    expect((await bootProblem(loadSite())).code).toBe("INVALID_SITE_ID");
    expect(requested).toEqual([]);
    window.history.pushState({}, "", "/");
  });
});

describe("test hygiene", () => {
  it("restores globalThis.fetch after each test", () => {
    const before = globalThis.fetch;
    stubFetch({});
    expect(globalThis.fetch).not.toBe(before);
    vi.unstubAllGlobals();
    expect(globalThis.fetch).toBe(before);
  });
});
