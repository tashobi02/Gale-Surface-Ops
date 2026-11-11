/**
 * T07.03 — hash router (docs/specs/03 §A; 01 FR-01, FR-16, FR-30). Pure parsing: every route 03 §A lists, the `#/map`
 * redirect, SCR-09 deep links, the QR join query, and a safe answer for anything else (never a throw, never a guess).
 */
import { describe, expect, it } from "vitest";
import { ROUTES, parseHash, routeHash } from "../../src/ui/router";

describe("parseHash: the routes of 03 §A", () => {
  const cases: Array<[string, string, string, string]> = [
    // hash, id, screen, mode (04 §B.2)
    ["#/", "landing", "SCR-01", "brief"],
    ["#/join", "join", "SCR-10", "brief"],
    ["#/planner", "planner", "SCR-02", "ops"],
    ["#/briefing", "briefing", "SCR-08", "print"],
    ["#/ops", "ops", "SCR-11", "ops"],
    ["#/setup", "setup", "SCR-20", "ops"],
    ["#/report", "report", "SCR-17", "print"],
    ["#/eva/EV1", "eva", "SCR-12", "ops"],
    ["#/eva/EV2", "eva", "SCR-12", "ops"],
    ["#/hud/EV1", "hud", "SCR-13", "hud"],
    ["#/hud/EV2", "hud", "SCR-13", "hud"],
    ["#/earth", "earth", "SCR-16", "ops"],
    ["#/presenter", "presenter", "SCR-19", "ops"],
    ["#/sources", "sources", "SCR-09", "brief"],
    ["#/replay", "replay", "—", "ops"],
  ];
  it.each(cases)("%s -> %s (%s, %s)", (hash, id, screen, mode) => {
    const route = parseHash(hash);
    expect(route.id).toBe(id);
    expect(route.screen).toBe(screen);
    expect(route.mode).toBe(mode);
  });

  it("treats an empty hash, a bare # and a trailing slash like the routes they name", () => {
    expect(parseHash("").id).toBe("landing");
    expect(parseHash("#").id).toBe("landing");
    expect(parseHash("#/ops/").id).toBe("ops");
  });

  it("carries the crew member of an EVA or HUD route", () => {
    expect(parseHash("#/eva/EV2").crewId).toBe("EV2");
    expect(parseHash("#/hud/EV1").crewId).toBe("EV1");
    expect(parseHash("#/ops").crewId).toBeUndefined();
  });

  it("redirects #/map (v1) to #/planner", () => {
    const route = parseHash("#/map");
    expect(route.id).toBe("planner");
    expect(route.hash).toBe("#/planner");
    expect(route.redirected).toBe(true);
  });

  it("keeps the SCR-09 deep link anchor, and drops one with unsafe characters", () => {
    expect(parseHash("#/sources#layer-slope").anchor).toBe("layer-slope");
    expect(parseHash("#/sources#<script>").anchor).toBeUndefined();
    expect(parseHash("#/sources").anchor).toBeUndefined();
  });

  it("reads the QR join query (#/join?role=eva:EV1) and only accepts a role the Hab Core knows", () => {
    expect(parseHash("#/join?role=eva:EV1").query.role).toBe("eva:EV1");
    expect(parseHash("#/join?role=eva:EV1").joinRole).toBe("eva:EV1");
    expect(parseHash("#/join?role=root").joinRole).toBeUndefined();
    expect(parseHash("#/join").joinRole).toBeUndefined();
  });
});

describe("parseHash: connection role (one Hab Core connection per tab)", () => {
  it("the EVA tablet is eva:<crew> and the HUD is its own read-only role hud:<crew> (02 §E.4)", () => {
    expect(parseHash("#/eva/EV1").role).toBe("eva:EV1");
    expect(parseHash("#/hud/EV1").role).toBe("hud:EV1");
    expect(parseHash("#/hud/EV2").role).toBe("hud:EV2");
  });

  it("a join link may name a HUD role", () => {
    expect(parseHash("#/join?role=hud:EV2").joinRole).toBe("hud:EV2");
  });

  it("the ops console is the ops role", () => {
    expect(parseHash("#/ops").role).toBe("ops");
  });

  it("planner, join, report, briefing, sources, landing and unknown routes open no connection", () => {
    for (const h of ["#/", "#/join", "#/planner", "#/briefing", "#/sources", "#/report", "#/nope"]) {
      expect(parseHash(h).role, h).toBeNull();
    }
  });

  it("routes whose screen is not built open no connection either (SCR-16 earth, SCR-19 presenter, SCR-20 setup)", () => {
    for (const h of ["#/earth", "#/presenter", "#/setup"]) expect(parseHash(h).role, h).toBeNull();
  });
});

describe("parseHash: anything else is a safe unknown route", () => {
  it.each(["#/nope", "#/eva", "#/eva/EV3", "#/eva/ev1", "#/hud", "#/ops/extra", "#//ops", "#/..%2fops", "nonsense", "#/eva/EV1/x"])(
    "%s",
    (hash) => {
      const route = parseHash(hash);
      expect(route.id).toBe("unknown");
      expect(route.screen).toBeNull();
      expect(route.role).toBeNull();
      expect(route.requested).toBe(hash);
    },
  );

  it("does not throw for hostile input", () => {
    for (const h of ["#/%E0%A4%A", "#/" + "a".repeat(10_000), "#/\u0000", "#/eva/EV1‮"]) {
      expect(() => parseHash(h)).not.toThrow();
      expect(parseHash(h).id).toBe("unknown");
    }
  });
});

describe("routeHash", () => {
  it("builds the canonical hash of a route", () => {
    expect(routeHash("ops")).toBe("#/ops");
    expect(routeHash("eva", "EV2")).toBe("#/eva/EV2");
    expect(routeHash("hud", "EV1")).toBe("#/hud/EV1");
    expect(routeHash("landing")).toBe("#/");
  });

  it("every table entry round-trips through parseHash", () => {
    for (const entry of ROUTES) {
      const hash = entry.crew ? routeHash(entry.id, "EV1") : routeHash(entry.id);
      expect(parseHash(hash).id, hash).toBe(entry.id);
    }
  });
});
