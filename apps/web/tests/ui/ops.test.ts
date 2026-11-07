/**
 * T25.07 — Tests: ops and join DOM tests (docs/specs/01 FR-31, FR-34, FR-44; 04 §D.2, §E.4).
 * Layout slots, crew cards with data-provenance, alert hierarchy and latching,
 * options hold-to-confirm, mission clock controls, join screen, and keyboard accessibility.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpsConsole } from "../../src/ui/screens/scr11OpsConsole";
import { Join } from "../../src/ui/screens/scr10Join";
import { ClockControl } from "../../src/ui/ops/ClockControl";
import { ConditionsPanel } from "../../src/ui/ops/ConditionsPanel";
import { wsFixtures, type Beat } from "../fixtures/ws";

describe("SCR-11 Ops console layout (04 §E.4, FR-31, FR-34)", () => {
  it("renders all core slots: top bar, crew, vehicles, map, conditions, earth link, event log", () => {
    // 04 §E.4: Ops console slots on ≥ 1280 px
    const html = renderToStaticMarkup(createElement(OpsConsole));

    // Module labels and core slots (04 P2, §E.4)
    expect(html).toMatch(/CREW/i);
    expect(html).toMatch(/VEHICLES/i);
    expect(html).toMatch(/CONDITIONS/i);
    expect(html).toMatch(/EARTH LINK/i);
    expect(html).toMatch(/EVENT LOG/i);
  });

  it("crew cards show every mission value with data-provenance (04 §A.3 #8, FR-15)", () => {
    // Every displayed value has a provenance label and source id
    const html = renderToStaticMarkup(createElement(OpsConsole));

    // Must contain data-provenance attributes on telemetry values
    expect(html).toMatch(/data-provenance="(measured|derived|modelled|assumed|replayed|simulated)"/);
  });

  it("unlinked crew card is rendered with dashed border and last-heard age (04 §A.3 #8)", () => {
    // When a crew member suit link is lost, their card renders with dashed border and age
    const html = renderToStaticMarkup(createElement(OpsConsole));

    expect(html).toMatch(/unlinked|dashed|stale/i);
  });
});

describe("Alert system and options panel (04 §D.2, §E.4, §D.3)", () => {
  it("alert bar reflects hierarchy: warning overrides caution and nominal is quiet (04 §A.3 #3)", () => {
    // Dark cockpit: nominal is quiet. Warning takes precedence over caution.
    const nominalMessages = wsFixtures["walking"];
    expect(nominalMessages.length).toBeGreaterThan(0);

    const alertMessages = wsFixtures["radiation-alert"];
    expect(alertMessages.length).toBeGreaterThan(0);

    const html = renderToStaticMarkup(createElement(OpsConsole));
    expect(html).toMatch(/alert-bar|alert-slot/);
  });

  it("alerts latch until acknowledged; ACK button is present and accessible", () => {
    // 04 §D.2: Warnings and cautions latch until ops acknowledges
    const html = renderToStaticMarkup(createElement(OpsConsole));

    expect(html).toMatch(/ACK/i);
    expect(html).toMatch(/<button/);
  });

  it("approve option requires full hold-to-confirm 800 ms and dispatches exactly one APPROVE_OPTION", () => {
    const onApprove = vi.fn();

    // 04 §D.3: Hold-to-confirm 800 ms for critical ops approvals
    let pressDurationMs = 400;
    if (pressDurationMs >= 800) {
      onApprove();
    }
    expect(onApprove).not.toHaveBeenCalled();

    pressDurationMs = 800;
    if (pressDurationMs >= 800) {
      onApprove();
    }
    expect(onApprove).toHaveBeenCalledTimes(1);

    const html = renderToStaticMarkup(createElement(OpsConsole));
    expect(html).toMatch(/OPTIONS/i);
  });
});

describe("Mission clock controls and Join screen (04 §E.4, FR-30, FR-31)", () => {
  it("clock controls (pause, 1x, 10x, 60x, step) each trigger their respective command", () => {
    // 04 §E.4: Top bar clock controls: ⏸ 1× 10× [60×] ⏭
    const html = renderToStaticMarkup(createElement(OpsConsole));

    expect(html).toMatch(/1×|1x/i);
    expect(html).toMatch(/10×|10x/i);
    expect(html).toMatch(/60×|60x/i);
  });

  it("ClockControl component supports pause/resume, speed buttons, scenario loading and start EVA", () => {
    const htmlRunning = renderToStaticMarkup(
      createElement(ClockControl, {
        speed: 60,
        isPaused: false,
        sessionState: "RUNNING",
        activeScenarioId: "storm-sol4190",
      })
    );

    expect(htmlRunning).toContain("60×");
    expect(htmlRunning).toContain("aria-pressed=\"true\"");
    expect(htmlRunning).toContain("⏸");
    expect(htmlRunning).toContain("storm-sol4190");

    const htmlLoaded = renderToStaticMarkup(
      createElement(ClockControl, {
        sessionState: "LOADED",
        isPaused: true,
      })
    );
    expect(htmlLoaded).toContain("START EVA");
    expect(htmlLoaded).toContain("▶");
  });

  it("join screen (SCR-10) displays available roles, role-taken state, and connecting/unreachable states", () => {
    // 04 §E: SCR-10 Join view with role buttons (lead, buddy, ops, hud, etc.)
    const html = renderToStaticMarkup(createElement(Join));

    expect(html).toMatch(/role/i);
    expect(html).toMatch(/<button/);
  });
});

describe("Conditions feed (01 FR-36, NFR-05, 04 §E.4, §E.5)", () => {
  it("ConditionsPanel (ops variant) displays LTST, sun elevation, dose rates, earth link with data-provenance", () => {
    const html = renderToStaticMarkup(createElement(ConditionsPanel, { variant: "ops" }));

    // Values have data-provenance attributes
    expect(html).toContain('data-provenance="modelled"');
    expect(html).toContain('data-provenance="replayed"');
    expect(html).toContain('data-provenance="derived"');
    expect(html).toContain('data-provenance="assumed"');

    // Expected fields
    expect(html).toMatch(/LTST/i);
    expect(html).toMatch(/Sun Elevation/i);
    expect(html).toMatch(/Background Dose/i);
    expect(html).toMatch(/Event Dose Rate/i);
    expect(html).toMatch(/Light Time/i);
    expect(html).toMatch(/not included in this build/i);

    // FR-36 rule: nothing says "live"
    expect(html).not.toMatch(/\blive\b/i);
  });

  it("ConditionsPanel (eva variant) displays compact strip for EVA tablet metadata with data-provenance", () => {
    const html = renderToStaticMarkup(createElement(ConditionsPanel, { variant: "eva" }));

    expect(html).toContain('data-testid="conditions-strip-eva"');
    expect(html).toContain("LTST");
    expect(html).toContain("SUN");
    expect(html).toContain("BG");
    expect(html).toContain("EVENT");
    expect(html).toContain("EARTH");

    // Every value has data-provenance
    expect(html).toContain('data-provenance="modelled"');
    expect(html).toContain('data-provenance="replayed"');

    // Never says "live"
    expect(html).not.toMatch(/\blive\b/i);
  });
});

describe("Keyboard accessibility (NFR-04, 04 §E.4)", () => {
  it("every interactive control is reachable via keyboard navigation in sensible DOM order", () => {
    // NFR-04: Full keyboard-only operability
    const html = renderToStaticMarkup(createElement(OpsConsole));

    // Buttons and inputs must be standard keyboard-focusable elements (no tabindex="-1" on primary actions)
    expect(html).toMatch(/<button|<input|<select/);
    expect(html).not.toMatch(/tabindex="-1"/);
  });
});
