import { describe, expect, it } from "vitest";
import { isKnownSource } from "../../e2e/lib/provenance";

describe("provenance source kinds (T12.02, T12.07)", () => {
  it.each(["scenario.walkback_limit_km", "result.totals.distance_m", "manifest:mock_site", "user:task", "unavailable:result.radiation", "rule:limit", "proj:map", "pois:site"])('accepts the state source %s', (source) => {
    expect(isKnownSource(source, [])).toBe(true);
  });
  it("accepts only dataset ids in the manifest, including multi-dataset values", () => {
    expect(isKnownSource("dem model", ["dem", "model"])).toBe(true);
    expect(isKnownSource("dem unknown", ["dem", "model"])).toBe(false);
    expect(isKnownSource("", ["dem"])).toBe(false);
  });
  it("rejects an invented state path", () => {
    expect(isKnownSource("bogus:value", [])).toBe(false);
  });
});
