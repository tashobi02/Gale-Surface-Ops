/**
 * BD-25 (T21.06; 05 §E.7): compute `rateAt` and the pipeline's `step_hold_integral_ugy` use the same left-closed
 * step-hold, [t_i, t_{i+1}) takes rate_i. This test feeds `rateAt` every sample instant of the real committed series and the
 * second before it; `pipeline/tests/test_rad.py::test_step_hold_is_left_closed_at_every_real_sample_instant_bd25` feeds the same
 * instants to the Python integral. Needs only the committed file.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DoseSeries } from "@marswalk/protocol";
import { rateAt } from "../src/eventDose";

const here = dirname(fileURLToPath(import.meta.url));
const series = JSON.parse(readFileSync(join(here, "../../../scenarios/storm-sol4190/dose_series.json"), "utf8")) as DoseSeries;
const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

describe("rateAt is left-closed at every real sample instant (BD-25)", () => {
  it("at t_i it is rate_i and one second before t_i it is rate_{i-1}", () => {
    expect(series.samples.length).toBeGreaterThan(100);
    for (let i = 1; i < series.samples.length; i++) {
      const [t, rate] = series.samples[i]!;
      expect(rateAt(series, t), `at ${t}`).toBe(rate);
      expect(rateAt(series, iso(Date.parse(t) - 1000)), `1 s before ${t}`).toBe(series.samples[i - 1]![1]);
    }
  });

  it("before the first sample there is no rate", () => {
    expect(rateAt(series, iso(Date.parse(series.samples[0]![0]) - 1000))).toBeNull();
  });
});
