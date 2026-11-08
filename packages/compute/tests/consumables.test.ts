/**
 * T05b.16: suit consumables (docs/specs/02 §D.14; FR-35). O₂ fraction falls at
 * P_met / P_ref / o2_nominal_h per hour, P_met = p_walk_w walking or p_rest_w resting.
 * Every coefficient is read from the storm scenario's suit ParamSet; expected values follow from it.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ParamSet } from "@marswalk/protocol";
import { o2RemainingS, stepO2 } from "../src/consumables";

const here = dirname(fileURLToPath(import.meta.url));
const suit = JSON.parse(readFileSync(join(here, "../../../scenarios/storm-sol4190/param_sets/suit-assumed.json"), "utf8")) as ParamSet;
const v = suit.values as Record<string, number>;
const NOMINAL_S = v.o2_nominal_h * 3600;
const atPower = (p_w: number): ParamSet => ({ ...suit, values: { ...suit.values, p_walk_w: p_w, p_rest_w: p_w } }) as ParamSet;

describe("stepO2 / o2RemainingS (02 §D.14)", () => {
  it("at P_ref the suit lasts exactly o2_nominal_h", () => {
    const ref = atPower(v.p_ref_w);
    expect(o2RemainingS(1, "walking", ref)).toBeCloseTo(NOMINAL_S, 6);
    expect(stepO2(1, "walking", NOMINAL_S / 2, ref)).toBeCloseTo(0.5, 12);
  });

  it("walking drains faster than resting by the power ratio p_walk_w / p_rest_w", () => {
    const walk = 1 - stepO2(1, "walking", 600, suit);
    const rest = 1 - stepO2(1, "resting", 600, suit);
    expect(walk / rest).toBeCloseTo(v.p_walk_w / v.p_rest_w, 9);
    expect(walk).toBeCloseTo((v.p_walk_w / v.p_ref_w / NOMINAL_S) * 600, 12);
  });

  it("time to empty follows from the rate and the fraction left", () => {
    const rate_per_s = v.p_walk_w / v.p_ref_w / NOMINAL_S;
    expect(o2RemainingS(0.4, "walking", suit)).toBeCloseTo(0.4 / rate_per_s, 6);
    expect(o2RemainingS(0, "resting", suit)).toBe(0);
  });

  it("never returns a negative fraction", () => {
    expect(stepO2(0.001, "walking", NOMINAL_S, suit)).toBe(0);
    expect(stepO2(0, "walking", 1, suit)).toBe(0);
  });

  it("every coefficient comes from the suit ParamSet", () => {
    const longer = { ...suit, values: { ...suit.values, o2_nominal_h: v.o2_nominal_h * 2 } } as ParamSet;
    expect(o2RemainingS(1, "walking", longer)).toBeCloseTo(2 * o2RemainingS(1, "walking", suit), 6);
  });
});
