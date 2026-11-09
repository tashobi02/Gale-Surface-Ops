import { describe, expect, it } from "vitest";
import type { EnvConstant } from "@marswalk/protocol";
import { estimateDose } from "../src/radiation";

// 05 §C verbatim inputs
const SOLAR_MAX_RATE: EnvConstant = {
  const_id: "rad-gale-dose-eq-solar-max",
  quantity: "surface dose equivalent rate",
  value: 0.64,
  low: 0.52,
  high: 0.76,
  unit: "mSv/day",
  conditions: {
    solar_phase: "max",
    location: "Gale crater floor",
    period: "2012-2013",
  },
  provenance: "measured",
  source_id: "hassler-2014-rad",
};

const SOLAR_MIN_RATE: EnvConstant = {
  const_id: "rad-gale-dose-eq-solar-min",
  quantity: "surface dose equivalent rate",
  value: 0.925,
  low: 0.85,
  high: 1.0,
  unit: "mSv/day",
  conditions: {
    solar_phase: "min",
    location: "Gale crater floor",
    period: "~2019",
  },
  provenance: "measured",
  source_id: "simonsen-2024-rad",
  note: "reported range, Simonsen et al. 2024",
};

describe("estimateDose (T06.04 / T06.08, FR-12)", () => {
  it("7 h at solar max 0.64 mSv/day → 0.187 mSv (range 0.152–0.222) (02 §D.4)", () => {
    const res = estimateDose(SOLAR_MAX_RATE, 7);
    expect(res).toBeDefined();
    expect(res?.const_id).toBe("rad-gale-dose-eq-solar-max");
    expect(res?.solar_phase).toBe("max");
    expect(res?.dose_mSv).toBeCloseTo(0.187, 3);
    expect(res?.dose_low_mSv).toBeCloseTo(0.152, 3);
    expect(res?.dose_high_mSv).toBeCloseTo(0.222, 3);
  });

  it("7 h at solar min 0.85–1.0 mSv/day → 0.248–0.292 mSv (02 §D.4)", () => {
    const res = estimateDose(SOLAR_MIN_RATE, 7);
    expect(res).toBeDefined();
    expect(res?.const_id).toBe("rad-gale-dose-eq-solar-min");
    expect(res?.solar_phase).toBe("min");
    // 02 §D.4 specifies the range 0.248–0.292 mSv; no midpoint is specified in 02 §D.4
    expect(res?.dose_low_mSv).toBeCloseTo(0.248, 3);
    expect(res?.dose_high_mSv).toBeCloseTo(0.292, 3);
  });

  it("148 min at solar max → 0.066 mSv (range 0.053–0.078) (05 §F.3)", () => {
    const durationH = 148 / 60;
    const res = estimateDose(SOLAR_MAX_RATE, durationH);
    expect(res).toBeDefined();
    expect(res?.const_id).toBe("rad-gale-dose-eq-solar-max");
    expect(res?.solar_phase).toBe("max");
    expect(res?.dose_mSv).toBeCloseTo(0.066, 3);
    expect(res?.dose_low_mSv).toBeCloseTo(0.053, 3);
    expect(res?.dose_high_mSv).toBeCloseTo(0.078, 3);
  });

  it("throws when conditions.solar_phase is missing or invalid", () => {
    const missingPhase = { ...SOLAR_MAX_RATE, conditions: {} };
    expect(() => estimateDose(missingPhase, 2)).toThrow(/Invalid or missing conditions\.solar_phase/);

    const invalidPhase = { ...SOLAR_MAX_RATE, conditions: { solar_phase: "medium" } };
    expect(() => estimateDose(invalidPhase, 2)).toThrow(/Invalid or missing conditions\.solar_phase/);
  });
});
