import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EarthLinkTable, ParamSet } from "@marswalk/protocol";
import { describe, expect, it } from "vitest";
import {
  deliveryTime,
  DTE_MIN_ELEV_DEG,
  activePass,
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

  it("regression pin: the committed scenario table row at the alert hour has light_time_s 949.7 (not an independent SPICE check)", () => {
    // This compares the table with a value read from the same table, so it only catches an accidental edit of
    // `scenarios/storm-sol4190/earth_link.json` or a change in `linkAt`. The independent check that 02 §D.12
    // asks for is the `it.todo` below.
    const filePath = resolve(__dirname, "../../../scenarios/storm-sol4190/earth_link.json");
    const realTable: EarthLinkTable = JSON.parse(readFileSync(filePath, "utf-8"));

    const row = linkAt(realTable, "2024-05-20T12:00:00Z");
    expect(row).not.toBeNull();
    expect(row!.light_time_s).toBeCloseTo(949.7, 0);
  });

  it.todo(
    "light time for the scenario date matches an independent spiceypy or WebGeocalc value within 1 s (02 §D.12 validation; needs a value computed outside this repo's table, TASK-21 / T05b.20)",
  );
});

describe("earthLink parameters and inputs fail loudly (02 §D.12)", () => {
  const at = "2026-11-10T12:05:00Z";

  it.each([
    ["missing", undefined],
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["negative", -1],
    ["a boolean", true],
  ])("inConjunction throws RangeError when conjunction_deg is %s (no built-in fallback)", (_label, bad) => {
    const values: Record<string, number | boolean> = { ...mockParams.values };
    if (bad === undefined) delete values.conjunction_deg;
    else values.conjunction_deg = bad;
    expect(() => inConjunction(syntheticTable, at, { ...mockParams, values })).toThrow(RangeError);
    expect(() => inConjunction(syntheticTable, at, { ...mockParams, values })).toThrow("conjunction_deg");
    expect(() => deliveryTime(syntheticTable, "to_earth", at, { ...mockParams, values })).toThrow(RangeError);
  });

  it("inConjunction uses the ParamSet threshold, strictly below", () => {
    const wide = { ...mockParams, values: { ...mockParams.values, conjunction_deg: 50 } };
    expect(inConjunction(syntheticTable, at, wide)).toBe(true); // 45 < 50
    const exact = { ...mockParams, values: { ...mockParams.values, conjunction_deg: 45 } };
    expect(inConjunction(syntheticTable, at, exact)).toBe(false); // 45 < 45 is false
  });

  it("dte_enabled is on only when it is the boolean true (the number 1 does not enable DTE)", () => {
    const one = { ...mockParams, values: { ...mockParams.values, dte_enabled: 1 } };
    const result = deliveryTime(syntheticTable, "to_earth", "2026-11-10T12:30:00Z", one);
    expect(result?.via).toBe("tgo");
    expect(result?.deliver_utc).toBe("2026-11-10T13:15:00.000Z");
  });

  it("deliveryTime throws RangeError when the table has no passes", () => {
    const noPasses: EarthLinkTable = { ...syntheticTable, passes: [] };
    expect(() => deliveryTime(noPasses, "to_earth", at, mockParams)).toThrow(RangeError);
    expect(() => deliveryTime(noPasses, "to_mars", at, mockParams)).toThrow(RangeError);
  });

  it("deliveryTime throws RangeError when the passes are not sorted by start", () => {
    const unsorted: EarthLinkTable = { ...syntheticTable, passes: [...syntheticTable.passes].reverse() };
    expect(() => deliveryTime(unsorted, "to_earth", at, mockParams)).toThrow(RangeError);
    expect(() => deliveryTime(unsorted, "to_mars", at, mockParams)).toThrow(RangeError);
  });

  it("deliveryTime throws RangeError for a pass that ends before it starts", () => {
    const bad: EarthLinkTable = {
      ...syntheticTable,
      passes: [
        { ...syntheticTable.passes[0], start_utc: "2026-11-10T12:10:00Z", end_utc: "2026-11-10T12:00:00Z" },
        syntheticTable.passes[1],
      ],
    };
    expect(() => deliveryTime(bad, "to_earth", at, mockParams)).toThrow(RangeError);
  });

  it("accepts the committed storm table, including its one-sample pass with start = end", () => {
    const filePath = resolve(__dirname, "../../../scenarios/storm-sol4190/earth_link.json");
    const real: EarthLinkTable = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(real.passes.some((p) => p.start_utc === p.end_utc)).toBe(true);
    expect(() => deliveryTime(real, "to_earth", "2024-05-20T12:00:00Z", mockParams)).not.toThrow();
  });
});

describe("Earth to Mars with direct-to-Earth enabled (02 §D.12)", () => {
  const dteParams: ParamSet = { ...mockParams, values: { ...mockParams.values, dte_enabled: true } };

  it("delivers at Mars arrival via dte when Earth elevation there is at least DTE_MIN_ELEV_DEG", () => {
    // Earth sends 12:10Z, arrives at Mars 12:25Z (between passes); the row at or before 12:25Z is 12:10Z (24 deg).
    const result = deliveryTime(syntheticTable, "to_mars", "2026-11-10T12:10:00Z", dteParams);
    expect(result).toEqual({ deliver_utc: "2026-11-10T12:25:00.000Z", via: "dte", light_time_s: 900 });
  });

  it("falls back to the next pass start when Earth elevation at Mars arrival is below DTE_MIN_ELEV_DEG", () => {
    const lowElev: EarthLinkTable = {
      ...syntheticTable,
      rows: syntheticTable.rows.map((r) => ({ ...r, earth_elev_deg: DTE_MIN_ELEV_DEG - 1 })),
    };
    const result = deliveryTime(lowElev, "to_mars", "2026-11-10T12:10:00Z", dteParams);
    expect(result?.via).toBe("tgo");
    expect(result?.deliver_utc).toBe("2026-11-10T13:00:00.000Z");
  });

  it("DTE at exactly DTE_MIN_ELEV_DEG is allowed (boundary is inclusive)", () => {
    const edge: EarthLinkTable = {
      ...syntheticTable,
      rows: syntheticTable.rows.map((r) => ({ ...r, earth_elev_deg: DTE_MIN_ELEV_DEG })),
    };
    expect(deliveryTime(edge, "to_mars", "2026-11-10T12:10:00Z", dteParams)?.via).toBe("dte");
    expect(deliveryTime(edge, "to_earth", "2026-11-10T12:30:00Z", dteParams)?.via).toBe("dte");
  });
});

describe("conjunction at the queued pass start (ratified, BD-60; 02 §D.12 is silent)", () => {
  // The table enters conjunction (2 deg < 3 deg) at 13:00Z, the start of the TGO pass; before that it is clear.
  const enters: EarthLinkTable = {
    ...syntheticTable,
    rows: syntheticTable.rows.map((r) => (r.t_utc === "2026-11-10T13:00:00Z" ? { ...r, sep_angle_deg: 2 } : r)),
  };

  it("Mars to Earth: a message queued for a pass that starts in conjunction is not delivered", () => {
    expect(deliveryTime(enters, "to_earth", "2026-11-10T12:30:00Z", mockParams)).toBeNull();
  });

  it("Earth to Mars: a message queued for a pass that starts in conjunction is not delivered", () => {
    expect(deliveryTime(enters, "to_mars", "2026-11-10T12:10:00Z", mockParams)).toBeNull();
  });

  it("a queued message is still delivered when the pass start is clear of conjunction", () => {
    expect(deliveryTime(syntheticTable, "to_earth", "2026-11-10T12:30:00Z", mockParams)?.via).toBe("tgo");
  });
});

describe("unparseable times throw RangeError instead of reading as 'no row' or 'no pass' (02 §D.12)", () => {
  const bad = ["garbage", "", "2026-13-45T99:00:00Z"];

  it.each(bad)("linkAt, activePass, nextPassStart and inConjunction reject t_utc %j", (t) => {
    expect(() => linkAt(syntheticTable, t)).toThrow(RangeError);
    expect(() => activePass(syntheticTable, t)).toThrow(RangeError);
    expect(() => nextPassStart(syntheticTable, t)).toThrow(RangeError);
    expect(() => inConjunction(syntheticTable, t, mockParams)).toThrow(RangeError);
  });

  it("linkAt rejects a table row whose t_utc does not parse", () => {
    const badRows: EarthLinkTable = {
      ...syntheticTable,
      rows: syntheticTable.rows.map((r, i) => (i === 0 ? { ...r, t_utc: "not a time" } : r)),
    };
    expect(() => linkAt(badRows, "2026-11-10T12:05:00Z")).toThrow(RangeError);
  });

  it("activePass and nextPassStart reject a pass whose start_utc or end_utc does not parse", () => {
    const badPass: EarthLinkTable = {
      ...syntheticTable,
      passes: [{ ...syntheticTable.passes[0], end_utc: "later" }, syntheticTable.passes[1]],
    };
    expect(() => activePass(badPass, "2026-11-10T12:05:00Z")).toThrow(RangeError);
    expect(() => nextPassStart(badPass, "2026-11-10T11:00:00Z")).toThrow(RangeError);
  });

  it("deliveryTime rejects an unparseable send time in both directions", () => {
    expect(() => deliveryTime(syntheticTable, "to_earth", "garbage", mockParams)).toThrow(RangeError);
    expect(() => deliveryTime(syntheticTable, "to_mars", "garbage", mockParams)).toThrow(RangeError);
  });
});

describe("a send time before the table is a RangeError, blackout is null (02 §D.12)", () => {
  const before = "2026-11-10T11:00:00Z"; // the first row is 11:45:00Z

  it("to_earth and to_mars throw RangeError naming the table start", () => {
    expect(() => deliveryTime(syntheticTable, "to_earth", before, mockParams)).toThrow(RangeError);
    expect(() => deliveryTime(syntheticTable, "to_mars", before, mockParams)).toThrow(RangeError);
    expect(() => deliveryTime(syntheticTable, "to_earth", before, mockParams)).toThrow("2026-11-10T11:45:00Z");
  });

  it("conjunction inside the table still returns null, not an error", () => {
    const inConj: EarthLinkTable = {
      ...syntheticTable,
      rows: syntheticTable.rows.map((r) => ({ ...r, sep_angle_deg: 2 })),
    };
    expect(deliveryTime(inConj, "to_earth", "2026-11-10T12:05:00Z", mockParams)).toBeNull();
  });
});
