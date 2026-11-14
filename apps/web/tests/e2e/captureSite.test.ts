import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureSiteConfig, captureSiteUrl } from "../../e2e/lib/captureSite";
import { REAL_SITE } from "../../e2e/lib/siteBundle";

const CAPTURE_SPEC_PATH = join(import.meta.dirname, "..", "..", "e2e", "checks", "capture.spec.ts");

describe("capture site selection (T17.04)", () => {
  const originalSite = process.env.E2E_SITE;

  afterEach(() => {
    if (originalSite === undefined) {
      delete process.env.E2E_SITE;
    } else {
      process.env.E2E_SITE = originalSite;
    }
  });

  it("defaults to mock_site when E2E_SITE is unset and switches to gale_boxwork when set", () => {
    delete process.env.E2E_SITE;
    const mockCfg = captureSiteConfig();
    expect(mockCfg.site).toBe("mock_site");
    expect(captureSiteUrl("/")).toBe("/?site=mock_site#/");

    process.env.E2E_SITE = REAL_SITE;
    const realCfg = captureSiteConfig();
    expect(realCfg.site).toBe(REAL_SITE);
    expect(realCfg.initialStops).not.toEqual(mockCfg.initialStops);
    expect(realCfg.refusedStop).not.toEqual(mockCfg.refusedStop);
    expect(captureSiteUrl("/", undefined, true)).toBe(`/?site=${REAL_SITE}&debug=1#/`);
    expect(captureSiteUrl("/ops")).toBe(`/?site=${REAL_SITE}#/ops`);
  });

  it("rejects unknown site names instead of silently falling back to mock_site", () => {
    expect(() => captureSiteConfig("unknown_site")).toThrow(/Unsupported capture site/);
  });

  it("wires capture.spec.ts to captureSiteConfig/captureSiteUrl without hardcoded mock_site literals", () => {
    const src = readFileSync(CAPTURE_SPEC_PATH, "utf8");
    expect(src).toContain("captureSiteConfig");
    expect(src).toContain("captureSiteUrl");
    expect(src).not.toMatch(/\?site=mock_site/);
    expect(src).not.toMatch(/site:\s*"mock_site"/);
  });
});
