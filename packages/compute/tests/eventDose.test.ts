/**
 * T05b.14: radiation trigger and event dose integral (docs/specs/02 §D.13, §F.2; FR-37, FR-38).
 * Synthetic series only. Thresholds and shielding factors are read from the storm scenario's
 * ParamSets; every expected value is computed here from the series' own step values.
 *
 * Rules where 02 §D.13 is silent (proposals for review):
 * - `rateAt` holds the last sample at or before t; before the first sample, or in a gap (null), it
 *   is null.
 * - A gap breaks "2 consecutive samples" and resets the clear timer: a gap neither raises nor clears.
 * - `integrateDose` uses the rate at the start of each step (left sum); a null rate adds nothing
 *   and its seconds are reported in `gap_s`. "If unsheltered" is the same steps in the suit (factor 1).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DoseSeries, ParamSet } from "@marswalk/protocol";
import { backgroundDoseUgy, integrateDose, rateAt, triggerState } from "../src/eventDose";

const here = dirname(fileURLToPath(import.meta.url));
const param = (id: string): ParamSet => JSON.parse(readFileSync(join(here, "../../../scenarios/storm-sol4190/param_sets", `${id}.json`), "utf8")) as ParamSet;
const alert = param("alert-assumed");
const shielding = param("shielding-assumed");
const a = alert.values as Record<string, number>;
const sf = shielding.values as Record<string, number>;

const T0 = Date.parse("2024-05-20T00:00:00Z");
const iso = (min: number): string => new Date(T0 + min * 60_000).toISOString().replace(".000Z", "Z");
const BG = 10; // synthetic background, µGy/h
const HIGH = a.rad_k_background * BG * 2; // above the trigger
const LOW = BG; // below the clear level

function series(samples: [number, number | null][]): DoseSeries {
  return {
    series_id: "synthetic",
    quantity: "surface absorbed dose rate",
    unit: "uGy/h",
    samples: samples.map(([m, r]) => [iso(m), r]),
    background_rate: BG,
    method: "archive",
    provenance: "replayed",
    source_id: "synthetic",
    integral_check: { expected_ugy: 0, computed_ugy: 0 },
  };
}

describe("rateAt", () => {
  const s = series([[0, LOW], [10, HIGH], [20, null], [30, LOW]]);
  it("holds the last sample at or before t; null before the first sample and inside a gap", () => {
    expect(rateAt(s, iso(-1))).toBeNull();
    expect(rateAt(s, iso(0))).toBe(LOW);
    expect(rateAt(s, iso(15))).toBe(HIGH);
    expect(rateAt(s, iso(25))).toBeNull();
    expect(rateAt(s, iso(40))).toBe(LOW);
  });
});

describe("triggerState (02 §D.13)", () => {
  // Samples every 10 min: low, high, high, high, then low for longer than rad_clear_min.
  const step = 10;
  const lowRun = Math.ceil(a.rad_clear_min / step) + 2;
  const s = series([
    [0, LOW],
    [10, HIGH],
    [20, HIGH],
    [30, HIGH],
    ...Array.from({ length: lowRun }, (_, i): [number, number] => [40 + i * step, LOW]),
  ]);

  it("fires on the second consecutive sample above k × background", () => {
    expect(triggerState(s, iso(10), alert)).toBe("nominal");
    expect(triggerState(s, iso(19), alert)).toBe("nominal");
    expect(triggerState(s, iso(20), alert)).toBe("alert");
  });

  it("a single sample above the trigger, or exactly at k × background, does not fire", () => {
    const one = series([[0, LOW], [10, HIGH], [20, LOW], [30, HIGH], [40, LOW]]);
    expect([10, 20, 30, 40].map((m) => triggerState(one, iso(m), alert))).toEqual(["nominal", "nominal", "nominal", "nominal"]);
    const atK = series([[0, a.rad_k_background * BG], [10, a.rad_k_background * BG]]);
    expect(triggerState(atK, iso(10), alert)).toBe("nominal");
  });

  it("clears only after the rate stays below clear_k × background for clear_min minutes", () => {
    expect(triggerState(s, iso(40), alert)).toBe("alert");
    expect(triggerState(s, iso(40 + a.rad_clear_min) , alert)).toBe("nominal");
    expect(triggerState(s, iso(40 + a.rad_clear_min - 1), alert)).toBe("alert");
  });

  it("a sample back above clear_k × background restarts the clear timer", () => {
    const mid = a.rad_clear_k * BG * 1.5; // below the trigger, above the clear level
    const r = series([[0, HIGH], [10, HIGH], [20, LOW], [30, mid], [40, LOW], [40 + a.rad_clear_min + 10, LOW]]);
    expect(triggerState(r, iso(20 + a.rad_clear_min), alert)).toBe("alert");
    expect(triggerState(r, iso(40 + a.rad_clear_min), alert)).toBe("nominal");
  });

  it("a gap neither raises nor clears: it breaks the consecutive count and the clear timer", () => {
    const g = series([[0, HIGH], [10, null], [20, HIGH], [30, LOW]]);
    expect(triggerState(g, iso(20), alert)).toBe("nominal");
    const c = series([[0, HIGH], [10, HIGH], [20, LOW], [30, null], [40, LOW], [40 + a.rad_clear_min, LOW]]);
    expect(triggerState(c, iso(20 + a.rad_clear_min + 5), alert)).toBe("alert");
    expect(triggerState(c, iso(40 + a.rad_clear_min), alert)).toBe("nominal");
  });

  it("thresholds come from the alert ParamSet", () => {
    const strict = { ...alert, values: { ...alert.values, rad_k_background: a.rad_k_background * 4 } } as ParamSet;
    expect(triggerState(s, iso(20), strict)).toBe("nominal");
  });
});

describe("integrateDose (02 §D.13, §F.2)", () => {
  // Three steps of 1 h: rates r1, r2, r3 with suit, rover and hab shielding.
  const [r1, r2, r3] = [BG, HIGH, LOW * 3];
  const s = series([[0, r1], [60, r2], [120, r3]]);
  const hour = (m: number, shelter: "suit" | "pressurized_rover" | "hab") => ({ t_utc: iso(m), dt_s: 3600, shelter });

  it("hand-checked 3-step series with suit, rover and hab shielding factors", () => {
    const d = integrateDose(s, [hour(0, "suit"), hour(60, "pressurized_rover"), hour(120, "hab")], shielding);
    expect(d.received_ugy).toBeCloseTo(r1 * sf.suit + r2 * sf.pressurized_rover + r3 * sf.hab, 9);
  });

  it("returns the received and the 'if unsheltered' dose, both in µGy", () => {
    const d = integrateDose(s, [hour(0, "hab"), hour(60, "hab"), hour(120, "hab")], shielding);
    expect(d.unsheltered_ugy).toBeCloseTo((r1 + r2 + r3) * sf.suit, 9);
    expect(d.received_ugy).toBeCloseTo((r1 + r2 + r3) * sf.hab, 9);
    expect(Object.keys(d).sort()).toEqual(["gap_s", "received_ugy", "unsheltered_ugy"]);
  });

  it("steps shorter than an hour scale by dt_s / 3600", () => {
    const d = integrateDose(s, [{ t_utc: iso(60), dt_s: 1, shelter: "suit" }], shielding);
    expect(d.received_ugy).toBeCloseTo(r2 / 3600, 12);
  });

  it("a terrain refuge uses its own refuge_factor and needs one", () => {
    const d = integrateDose(s, [{ t_utc: iso(60), dt_s: 3600, shelter: "refuge", refuge_factor: 0.25 }], shielding);
    expect(d.received_ugy).toBeCloseTo(r2 * 0.25, 9);
    expect(() => integrateDose(s, [{ t_utc: iso(60), dt_s: 3600, shelter: "refuge" }], shielding)).toThrow(/refuge_factor/);
  });

  it("gaps (null rate) contribute nothing and are reported", () => {
    const g = series([[0, r1], [60, null], [120, r3]]);
    const d = integrateDose(g, [hour(0, "suit"), hour(60, "suit"), hour(120, "suit")], shielding);
    expect(d.received_ugy).toBeCloseTo(r1 + r3, 9);
    expect(d.gap_s).toBe(3600);
  });

  it.todo("digitised series integral matches the published 8,100 µGy total within the stated tolerance (needs the TASK-21 series)");
});

/** Backend package 20 (T27.01, BD-132): the planned background dose, the series' own background rate times the planned duration. */
describe("backgroundDoseUgy", () => {
  const s = series([[0, LOW], [10, HIGH]]);
  it("is background_rate (µGy/h) times the duration in hours, with no shielding factor and no unit conversion", () => {
    expect(backgroundDoseUgy(s, 3600)).toBe(BG);
    expect(backgroundDoseUgy(s, 6 * 3600)).toBeCloseTo(6 * BG, 12);
    expect(backgroundDoseUgy(s, 90 * 60)).toBeCloseTo(1.5 * BG, 12);
    expect(backgroundDoseUgy(s, 0)).toBe(0);
  });

  it("agrees with integrateDose over the same duration at the background rate in the suit's unshielded factor", () => {
    const flat = { ...series([[0, BG], [600, BG]]) };
    const unsheltered = integrateDose(flat, [{ t_utc: iso(0), dt_s: 3600, shelter: "suit" }], shielding).unsheltered_ugy;
    expect(backgroundDoseUgy(flat, 3600)).toBeCloseTo(unsheltered, 9);
  });

  it("throws RangeError for a negative or non-finite duration and for a series without a usable background_rate", () => {
    expect(() => backgroundDoseUgy(s, -1)).toThrow(RangeError);
    expect(() => backgroundDoseUgy(s, Number.NaN)).toThrow(RangeError);
    expect(() => backgroundDoseUgy({ ...s, background_rate: Number.NaN }, 60)).toThrow(RangeError);
    expect(() => backgroundDoseUgy({ ...s, background_rate: -1 }, 60)).toThrow(RangeError);
  });
});
