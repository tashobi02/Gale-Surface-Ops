import { describe, expect, it } from "vitest";
import type { PlanResultMessage } from "@marswalk/protocol";
import okJson from "./plan-results/ok.json";
import partialJson from "./plan-results/partial.json";
import overLimitsJson from "./plan-results/over-limits.json";

describe("F2 — Canned PLAN_RESULT messages (T05.03)", () => {
  it("ok.json matches PlanResultMessage with status OK, totals, radiation, and warnings", () => {
    const msg = okJson as PlanResultMessage;

    expect(msg.type).toBe("PLAN_RESULT");
    expect(msg.request_id).toBe("r-0042");
    expect(msg.plan_revision).toBe(17);
    expect(msg.status).toBe("OK");
    expect(msg.totals).not.toBeNull();
    expect(msg.totals?.distance_m).toBe(6120);
    expect(msg.totals?.walk_time_min).toBe(128);
    expect(msg.totals?.max_walkback_km).toBe(3.06);
    expect(msg.radiation?.dose_mSv).toBe(0.066);
    expect(msg.legs.length).toBe(1);
    expect(msg.legs[0].status).toBe("OK");
    expect(msg.warnings.length).toBe(1);
    expect(msg.warnings[0].code).toBe("CAUTION_SLOPE");
  });

  it("partial.json matches PlanResultMessage with status PARTIAL, totals null, and NO_ROUTE leg", () => {
    const msg = partialJson as PlanResultMessage;

    expect(msg.type).toBe("PLAN_RESULT");
    expect(msg.request_id).toBe("r-0042");
    expect(msg.plan_revision).toBe(17);
    expect(msg.status).toBe("PARTIAL");
    expect(msg.totals).toBeNull();
    expect(msg.legs.length).toBe(2);

    expect(msg.legs[0].status).toBe("OK");
    expect(msg.legs[1].status).toBe("NO_ROUTE");

    if (msg.legs[1].status === "NO_ROUTE") {
      expect(msg.legs[1].reason).toBe("DISCONNECTED_BY_SLOPE");
      expect(msg.legs[1].nearest_reachable).toEqual({ x_m: 2905.0, y_m: -2410.0 });
    }
  });

  it("over-limits.json matches PlanResultMessage with status OVER_LIMITS and WALKBACK_EXCEEDED", () => {
    const msg = overLimitsJson as PlanResultMessage;

    expect(msg.type).toBe("PLAN_RESULT");
    expect(msg.request_id).toBe("r-0042");
    expect(msg.plan_revision).toBe(17);
    expect(msg.status).toBe("OVER_LIMITS");
    expect(msg.totals?.max_walkback_km).toBe(3.06);

    const walkbackWarning = msg.warnings.find((w) => w.code === "WALKBACK_EXCEEDED");
    expect(walkbackWarning).toBeDefined();
    expect(walkbackWarning?.severity).toBe("blocked");
    expect(walkbackWarning?.leg).toBeNull();
    expect(walkbackWarning?.from_m).toBeNull();
  });
});
