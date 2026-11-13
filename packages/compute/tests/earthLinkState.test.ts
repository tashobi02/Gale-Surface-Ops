/**
 * Whether the Earth link can carry a message right now (N-31, BD-156; 02 §D.12). The same three inputs the delivery rule uses:
 * the Sun-Earth-Mars angle against `conjunction_deg`, the DTE elevation limit when the ParamSet enables it, and the active relay pass.
 */
import type { EarthLinkTable, ParamSet } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import { DTE_MIN_ELEV_DEG, earthLinkState } from "../src/earthLink";

const params = (over: Record<string, unknown> = {}): ParamSet => ({
  param_set_id: "link-assumed",
  kind: "link",
  title: "Surface radio and Earth link",
  values: { conjunction_deg: 3, dte_enabled: false, ...over },
  provenance: "assumed",
  source_ids: [],
});

const row = (t_utc: string, sep_angle_deg = 45, earth_elev_deg = 20) => ({ t_utc, light_time_s: 900, sep_angle_deg, earth_elev_deg, orbiters: { mro: 0, maven: 0, tgo: 0 } });
const table = (rows: ReturnType<typeof row>[]): EarthLinkTable => ({
  step_s: 60,
  rows,
  passes: [
    { orbiter: "mro", start_utc: "2026-11-10T12:00:00Z", end_utc: "2026-11-10T12:10:00Z", max_elev_deg: 45 },
    { orbiter: "tgo", start_utc: "2026-11-10T13:00:00Z", end_utc: "2026-11-10T13:10:00Z", max_elev_deg: 50 },
  ],
  kernels: [],
  provenance: "derived",
});
const rows = [row("2026-11-10T11:45:00Z"), row("2026-11-10T12:05:00Z"), row("2026-11-10T12:30:00Z"), row("2026-11-10T13:05:00Z")];

describe("earthLinkState (N-31)", () => {
  it("AVAILABLE through the orbiter that is in its pass, with the pass end", () => {
    expect(earthLinkState(table(rows), "2026-11-10T12:05:00Z", params())).toEqual({ state: "AVAILABLE", via: "mro", until_utc: "2026-11-10T12:10:00Z" });
  });

  it("WAITING between passes: no carrier now, and no end time", () => {
    expect(earthLinkState(table(rows), "2026-11-10T12:30:00Z", params())).toEqual({ state: "WAITING", via: null, until_utc: null });
  });

  it("the pass starts available and ends not available (start inclusive, end exclusive, as activePass)", () => {
    expect(earthLinkState(table(rows), "2026-11-10T12:00:00Z", params())?.state).toBe("AVAILABLE");
    expect(earthLinkState(table(rows), "2026-11-10T12:10:00Z", params())?.state).toBe("WAITING");
  });

  it("BLACKOUT in conjunction, even during a pass: nothing is carried", () => {
    const t = table(rows.map((r) => (r.t_utc === "2026-11-10T12:05:00Z" ? { ...r, sep_angle_deg: 2 } : r)));
    expect(earthLinkState(t, "2026-11-10T12:05:00Z", params())).toEqual({ state: "BLACKOUT", via: null, until_utc: null });
  });

  it("direct to Earth when the ParamSet enables it and Earth is at or above the elevation limit, between passes too", () => {
    const high = table(rows.map((r) => ({ ...r, earth_elev_deg: DTE_MIN_ELEV_DEG })));
    expect(earthLinkState(high, "2026-11-10T12:30:00Z", params({ dte_enabled: true }))).toEqual({ state: "AVAILABLE", via: "dte", until_utc: null });
    expect(earthLinkState(high, "2026-11-10T12:30:00Z", params({ dte_enabled: false }))?.state).toBe("WAITING");
    const low = table(rows.map((r) => ({ ...r, earth_elev_deg: DTE_MIN_ELEV_DEG - 0.1 })));
    expect(earthLinkState(low, "2026-11-10T12:30:00Z", params({ dte_enabled: true }))?.state).toBe("WAITING");
  });

  it("null before the first table row: the geometry is unknown, so no state is claimed", () => {
    expect(earthLinkState(table(rows), "2026-11-10T11:00:00Z", params())).toBeNull();
  });

  it("an unparseable time is a RangeError, never WAITING", () => {
    expect(() => earthLinkState(table(rows), "not a time", params())).toThrow(RangeError);
  });
});
