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
import {
  MARS_GRAVITY_M_S2,
  O2_ENERGY_EQUIV_KJ_PER_L,
  WALKING_METABOLIC_W,
  o2LitresPerMinute,
  o2RemainingS,
  roverEnergyWh,
  stepO2,
} from "../src/consumables";
import { flatGrid, rendezvousRidge } from "./fixtures/v2grids";

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

/** T29.03 (backend package 19): the utility rover energy form of 02 §D.9, E = P_base * t + m * g * dh+ / eta, from the ParamSet. */
const ur1 = JSON.parse(readFileSync(join(here, "../../../scenarios/storm-sol4190/param_sets/ur1-assumed.json"), "utf8")) as ParamSet;
const u = ur1.values as Record<string, number>;

describe("roverEnergyWh (02 §D.9 robotic utility rover)", () => {
  it("uses 02 §D.9's Mars gravity", () => {
    expect(MARS_GRAVITY_M_S2).toBe(3.721);
  });

  it("on flat ground only the base power counts: P_base * t, in Wh", () => {
    const grid = flatGrid({ cell_m: 10, cellsWest: 10, cellsEast: 10, cellsNorth: 2, cellsSouth: 2 });
    expect(roverEnergyWh([[0, 0], [100, 0]], 3600, ur1, grid)).toBeCloseTo(u.p_base_w, 9);
    expect(roverEnergyWh([[0, 0], [100, 0]], 1800, ur1, grid)).toBeCloseTo(u.p_base_w / 2, 9);
    expect(roverEnergyWh([[0, 0]], 0, ur1, grid)).toBe(0);
  });

  it("a climb adds m * g * dh+ / eta joules; a descent adds nothing", () => {
    const { grid } = rendezvousRidge();
    const rise = (x: number): number => grid.elevation[Math.floor((grid.meta.origin_m[1] - 0) / grid.meta.cell_m) * grid.meta.width + Math.floor((x - grid.meta.origin_m[0]) / grid.meta.cell_m)]!;
    // Walk from the west foot up the flank (the plateau is at x = 0): a pure climb; the reverse is a pure descent.
    const foot: [number, number] = [-250, 0];
    const top: [number, number] = [0, 0];
    const dh = rise(top[0]) - rise(foot[0]);
    expect(dh).toBeGreaterThan(0);
    const up = roverEnergyWh([foot, top], 0, ur1, grid);
    expect(up).toBeCloseTo(((u.mass_kg * MARS_GRAVITY_M_S2 * dh) / u.climb_eff) / 3600, 6);
    expect(roverEnergyWh([top, foot], 0, ur1, grid)).toBe(0);
  });

  it("sums only the positive steps of a path that goes up, down and up", () => {
    const { grid } = rendezvousRidge();
    const at = (x: number): number => grid.elevation[Math.floor((grid.meta.origin_m[1] - 0) / grid.meta.cell_m) * grid.meta.width + Math.floor((x - grid.meta.origin_m[0]) / grid.meta.cell_m)]!;
    const xs = [-250, -150, -250, -50];
    const expected = (at(-150) - at(-250)) + (at(-50) - at(-250));
    expect(roverEnergyWh(xs.map((x) => [x, 0] as [number, number]), 0, ur1, grid)).toBeCloseTo(((u.mass_kg * MARS_GRAVITY_M_S2 * expected) / u.climb_eff) / 3600, 6);
  });

  it("reads every coefficient from the ParamSet", () => {
    const grid = flatGrid({ cell_m: 10, cellsWest: 10, cellsEast: 10, cellsNorth: 2, cellsSouth: 2 });
    const bigger = { ...ur1, values: { ...ur1.values, p_base_w: u.p_base_w * 3 } } as ParamSet;
    expect(roverEnergyWh([[0, 0]], 3600, bigger, grid)).toBeCloseTo(3 * u.p_base_w, 9);
  });

  it("a missing coefficient, a negative duration or a point off the grid is a RangeError naming the problem", () => {
    const grid = flatGrid({ cell_m: 10, cellsWest: 10, cellsEast: 10, cellsNorth: 2, cellsSouth: 2 });
    const { climb_eff: _drop, ...rest } = u;
    expect(() => roverEnergyWh([[0, 0]], 1, { ...ur1, values: rest } as ParamSet, grid)).toThrow(/climb_eff/);
    expect(() => roverEnergyWh([[0, 0]], -1, ur1, grid)).toThrow(RangeError);
    expect(() => roverEnergyWh([[0, 0], [1e6, 0]], 1, ur1, grid)).toThrow(RangeError);
  });
});

describe("o2LitresPerMinute (T18.04, T18.05, N-24; 02 §D.6)", () => {
  it("exports the two 02 §D.6 planning constants verbatim", () => {
    expect(WALKING_METABOLIC_W).toBe(351.7);
    expect(O2_ENERGY_EQUIV_KJ_PER_L).toBe(20.4);
  });

  it("at 351.7 W walking metabolic rate, O2 consumption rounds to 1.03 L/min", () => {
    expect(o2LitresPerMinute(351.7)).toBeCloseTo(1.03, 2);
    expect(o2LitresPerMinute(0)).toBe(0);
  });

  it("rejects negative or non-finite metabolic power with RangeError", () => {
    expect(() => o2LitresPerMinute(-1)).toThrow(RangeError);
    expect(() => o2LitresPerMinute(Number.NaN)).toThrow(RangeError);
    expect(() => o2LitresPerMinute(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
