import { describe, expect, it } from "vitest";
import { earthLinkState, asOfStamp } from "../../src/ui/screens/scr16EarthView";
import { parseHash } from "../../src/ui/router";

describe("SCR-16 Earth view", () => {
  it("connects with the earth role", () => expect(parseHash("#/earth").role).toBe("earth"));
  it("shows conjunction blackout", () => expect(earthLinkState({ blackout: true })).toBe("CONJUNCTION BLACKOUT"));
  it("does not invent an available or waiting relay state", () => expect(earthLinkState({ blackout: false })).toBeNull());
  it("shows supplied link states", () => {
    expect(earthLinkState({ blackout: false, link_state: "AVAILABLE" })).toBe("AVAILABLE");
    expect(earthLinkState({ blackout: false, link_state: "WAITING" })).toBe("WAITING");
  });
  it("shows unavailable when the feed is absent", () => expect(earthLinkState(null)).toBeNull());
  it("formats an as-of stamp from simulated timestamps", () => expect(asOfStamp("2026-11-13T12:00:00Z", "2026-11-13T12:13:00Z")).toBe("as of 12:00 (13 min ago)"));
  it("rejects future or missing timestamps", () => {
    expect(asOfStamp("2026-11-13T12:14:00Z", "2026-11-13T12:13:00Z")).toBeNull();
    expect(asOfStamp(null, "2026-11-13T12:13:00Z")).toBeNull();
  });
});
