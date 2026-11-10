import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EarthLinkTable, ParamSet } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import {
  deliveryTime,
  DTE_MIN_ELEV_DEG,
  inConjunction,
  linkAt,
  nextPassStart,
} from "../src/earthLink";

const mockParams: ParamSet = {
  param_set_id: "link-assumed",
  kind: "link",
  title: "Surface radio and Earth link",
  values: {
    range_hab_suit_m: 10000,
    range_suit_suit_m: 2000,
    range_rover_m: 5000,
    hab_mast_m: 10,
    relay_min_elev_deg: 10,
    conjunction_deg: 3,
    dte_enabled: false,
  },
  provenance: "assumed",
  source_ids: [],
};

const syntheticTable: EarthLinkTable = {
  step_s: 60,
  rows: [
    {
      t_utc: "2026-11-10T11:45:00Z",
      light_time_s: 900, // 15 min
      sep_angle_deg: 45,
      earth_elev_deg: 18,
      orbiters: { mro: -10, maven: -20, tgo: -10 },
    },
    {
      t_utc: "2026-11-10T12:00:00Z",
      light_time_s: 900, // 15 min
      sep_angle_deg: 45,
      earth_elev_deg: 20,
      orbiters: { mro: 25, maven: -10, tgo: -5 },
    },
    {
      t_utc: "2026-11-10T12:05:00Z",
      light_time_s: 900,
      sep_angle_deg: 45,
      earth_elev_deg: 22,
      orbiters: { mro: 40, maven: -5, tgo: -5 },
    },
    {
      t_utc: "2026-11-10T12:10:00Z",
      light_time_s: 900,
      sep_angle_deg: 45,
      earth_elev_deg: 24,
      orbiters: { mro: 10, maven: 0, tgo: -5 },
    },
    {
      t_utc: "2026-11-10T12:30:00Z",
      light_time_s: 900,
      sep_angle_deg: 45,
      earth_elev_deg: 30,
      orbiters: { mro: -20, maven: -15, tgo: -10 },
    },
    {
      t_utc: "2026-11-10T13:00:00Z",
      light_time_s: 900,
      sep_angle_deg: 45,
      earth_elev_deg: 35,
      orbiters: { mro: -30, maven: -20, tgo: 15 },
    },
  ],
  passes: [
    {
      orbiter: "mro",
      start_utc: "2026-11-10T12:00:00Z",
      end_utc: "2026-11-10T12:10:00Z",
      max_elev_deg: 45,
    },
    {
      orbiter: "tgo",
      start_utc: "2026-11-10T13:00:00Z",
      end_utc: "2026-11-10T13:10:00Z",
      max_elev_deg: 50,
    },
  ],
  kernels: [],
  provenance: "derived",
};

describe("earthLink (02 §D.12; FR-43)", () => {
  it("message sent during a pass is delivered at send time + light time", () => {
    // Send at 12:05:00Z (during MRO pass 12:00 - 12:10)
    const result = deliveryTime(syntheticTable, "to_earth", "2026-11-10T12:05:00Z", mockParams);
    expect(result).not.toBeNull();
    // 12:05:00Z + 900 s (15 min) = 12:20:00Z
    expect(result?.deliver_utc).toBe("2026-11-10T12:20:00.000Z");
    expect(result?.via).toBe("mro");
    expect(result?.light_time_s).toBe(900);
  });

  it("message sent between passes waits for the next pass start", () => {
    // Send at 12:30:00Z (after MRO pass ended at 12:10, before TGO pass starts at 13:00)
    const result = deliveryTime(syntheticTable, "to_earth", "2026-11-10T12:30:00Z", mockParams);
    expect(result).not.toBeNull();
    // Waits until TGO pass start at 13:00:00Z + 900 s (15 min) = 13:15:00Z
    expect(result?.deliver_utc).toBe("2026-11-10T13:15:00.000Z");
    expect(result?.via).toBe("tgo");
    expect(result?.light_time_s).toBe(900);
  });

  it("Earth -> Mars uses next_pass_start(t_send_earth + light_time)", () => {
    // Case 1: Arrives mid-pass at Mars
    // Earth sends at 11:50:00Z + 15 min light time -> arrives at Mars at 12:05:00Z (mid MRO pass)
    const midPassArrival = deliveryTime(syntheticTable, "to_mars", "2026-11-10T11:50:00Z", mockParams);
    expect(midPassArrival).not.toBeNull();
    expect(midPassArrival?.deliver_utc).toBe("2026-11-10T12:05:00.000Z");
    expect(midPassArrival?.via).toBe("mro");

    // Case 2: Arrives between passes at Mars
    // Earth sends at 12:10:00Z + 15 min light time -> arrives at Mars at 12:25:00Z (between passes)
    // Next pass starts at 13:00:00Z (TGO)
    const betweenPassArrival = deliveryTime(syntheticTable, "to_mars", "2026-11-10T12:10:00Z", mockParams);
    expect(betweenPassArrival).not.toBeNull();
    expect(betweenPassArrival?.deliver_utc).toBe("2026-11-10T13:00:00.000Z");
    expect(betweenPassArrival?.via).toBe("tgo");
  });

  it("conjunction (angle < threshold) returns null", () => {
    const conjunctionTable: EarthLinkTable = {
      ...syntheticTable,
      rows: syntheticTable.rows.map((r) => ({
        ...r,
        sep_angle_deg: 2.0, // < 3 deg threshold
      })),
    };

    expect(inConjunction(conjunctionTable, "2026-11-10T12:05:00Z", mockParams)).toBe(true);

    const toEarth = deliveryTime(conjunctionTable, "to_earth", "2026-11-10T12:05:00Z", mockParams);
    expect(toEarth).toBeNull();

    const toMars = deliveryTime(conjunctionTable, "to_mars", "2026-11-10T11:50:00Z", mockParams);
    expect(toMars).toBeNull();
  });

  it("direct-to-earth (DTE) delivers immediately when dte_enabled is true and elevation >= 10 deg", () => {
    const dteParams: ParamSet = {
      ...mockParams,
      values: {
        ...mockParams.values,
        dte_enabled: true,
      },
    };

    // Send at 12:30:00Z (between passes, but Earth elevation is 30 deg >= 10 deg)
    const toEarthDte = deliveryTime(syntheticTable, "to_earth", "2026-11-10T12:30:00Z", dteParams);
    expect(toEarthDte).not.toBeNull();
    // 12:30:00Z + 900 s = 12:45:00Z via DTE (no waiting for TGO at 13:00)
    expect(toEarthDte?.deliver_utc).toBe("2026-11-10T12:45:00.000Z");
    expect(toEarthDte?.via).toBe("dte");
  });

  it("linkAt binary searches the row at or before t_utc", () => {
    expect(linkAt(syntheticTable, "2026-11-10T11:40:00Z")).toBeNull();
    const row1 = linkAt(syntheticTable, "2026-11-10T12:00:00Z");
    expect(row1?.t_utc).toBe("2026-11-10T12:00:00Z");

    const rowBetween = linkAt(syntheticTable, "2026-11-10T12:07:00Z");
    expect(rowBetween?.t_utc).toBe("2026-11-10T12:05:00Z");

    const rowLast = linkAt(syntheticTable, "2026-11-10T14:00:00Z");
    expect(rowLast?.t_utc).toBe("2026-11-10T13:00:00Z");
  });

  it("nextPassStart returns earliest pass with start_utc >= t_utc", () => {
    const next1 = nextPassStart(syntheticTable, "2026-11-10T11:50:00Z");
    expect(next1).toMatchObject({ orbiter: "mro", start_utc: "2026-11-10T12:00:00Z" });

    const next2 = nextPassStart(syntheticTable, "2026-11-10T12:05:00Z");
    expect(next2).toMatchObject({ orbiter: "tgo", start_utc: "2026-11-10T13:00:00Z" });

    const nextNone = nextPassStart(syntheticTable, "2026-11-10T13:01:00Z");
    expect(nextNone).toBeNull();
  });

  it("exports DTE_MIN_ELEV_DEG as 10", () => {
    expect(DTE_MIN_ELEV_DEG).toBe(10);
  });

  it("light time for the scenario date matches a spiceypy spot check within 1 s", () => {
    const filePath = resolve(__dirname, "../../../scenarios/storm-sol4190/earth_link.json");
    const raw = readFileSync(filePath, "utf-8");
    const realTable: EarthLinkTable = JSON.parse(raw);

    const row = linkAt(realTable, "2024-05-20T12:00:00Z");
    expect(row).not.toBeNull();
    // 02 §D.12 / 01 §E.1: ~15.8 min = 948-950 s. Real SPICE row is 949.70 s.
    expect(row!.light_time_s).toBeGreaterThan(940);
    expect(row!.light_time_s).toBeLessThan(960);
    expect(row!.light_time_s).toBeCloseTo(949.7, 0);
  });
});
