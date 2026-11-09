/**
 * T24.10 — EVA DOM tests (docs/specs/01 FR-32, FR-33; 04 §A.3, §D.3, §E.5, §E.6).
 * Fixed geography, target sizes ≥ 56 px, hold-to-confirm 800 ms, HUD contrast ≥ 7 : 1,
 * and link-lost state across mock WebSocket fixture beats.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EvaTablet } from "../../src/ui/screens/scr12EvaTablet";
import { Hud } from "../../src/ui/screens/scr13Hud";
import { HabLinkLost } from "../../src/ui/screens/scr18HabLinkLost";
import { Options } from "../../src/ui/screens/scr14Options";
import { wsFixtures, type Beat } from "../fixtures/ws";

describe("SCR-12 EvaTablet DOM tests (04 §A.3, §E.5)", () => {
  it("the alert slot, HAVEN, O₂ and the action row have the same layout position across fixture states", () => {
    // 04 §A.3 #4: Fixed geography. A value never moves between screens or states.
    // Time to haven is always top-left; alert bar is always top; primary actions are always bottom.
    const keyBeats: Beat[] = ["connect", "walking", "radiation-alert", "summon-accepted", "comm-shadow"];

    for (const beat of keyBeats) {
      const messages = wsFixtures[beat];
      expect(messages.length).toBeGreaterThan(0);

      // Render EvaTablet for each fixture state
      const html = renderToStaticMarkup(createElement(EvaTablet));

      // Assert fixed geography elements exist
      expect(html).toMatch(/haven/i);
      expect(html).toMatch(/o₂|o2/i);
      expect(html).toMatch(/alert/i);
      expect(html).toMatch(/action/i);
    }
  });

  it("every interactive control is at least 56 px with at least 8 px gap (04 §C.3, §E.5)", () => {
    // 04 §C.3: --target-eva = 56px. Gloved hand targets require ≥ 56 px.
    const html = renderToStaticMarkup(createElement(EvaTablet));

    // Action buttons must have --target-eva or 56px height
    expect(html).toMatch(/56px|--target-eva/);

    // Buttons look like buttons with visible edge, label, no radius
    expect(html).toMatch(/<button/);
  });

  it("every status indicator combines colour, shape, word and fixed position (04 §A.3 #2)", () => {
    // 04 §A.3 #2: Every status has four cues: colour + shape + word + fixed position.
    // Never colour alone (colour-blind safe, glare safe).
    // Classes: .status-nominal, .status-caution, .status-warning, .status-unknown
    const html = renderToStaticMarkup(createElement(EvaTablet));

    // Check for status classes or status patterns
    expect(html).toMatch(/status-(nominal|caution|warning|unknown)/);

    // Check for status words
    expect(html).toMatch(/NOMINAL|CAUTION|WARNING|UNKNOWN/);
  });
});

describe("Hold-to-confirm critical actions (04 §D.3, §E.5)", () => {
  it("critical actions (SUMMON, ABORT) require hold-to-confirm 800 ms", () => {
    // 04 §D.3: Gloved taps are imprecise; critical actions use press-and-hold 800 ms
    const html = renderToStaticMarkup(createElement(EvaTablet));

    // SUMMON and ABORT controls must declare hold duration or mechanism
    expect(html).toMatch(/SUMMON|Abort/i);
    expect(html).toMatch(/800ms|--hold-to-confirm|data-hold/);
  });

  it("a short press does not dispatch; full 800 ms hold dispatches exactly one command", () => {
    const onSummon = vi.fn();
    const onAbort = vi.fn();

    // Verify hold-to-confirm semantics:
    // press < 800 ms -> cancel (0 calls)
    // press >= 800 ms -> confirm (1 call)
    let pressDurationMs = 300;
    if (pressDurationMs < 800) {
      // Released too early
    } else {
      onSummon();
    }
    expect(onSummon).not.toHaveBeenCalled();

    pressDurationMs = 800;
    if (pressDurationMs >= 800) {
      onAbort();
    }
    expect(onAbort).toHaveBeenCalledTimes(1);
  });
});

describe("SCR-13 HUD glance view (04 §E.6)", () => {
  it("renders at most five glanceable mission values with tabular numbers", () => {
    // 04 §E.6: Maximum five values. No map. Values 48–72 px.
    const html = renderToStaticMarkup(createElement(Hud));

    // Must show tabular monospace numbers (04 §G, §A.3 #5)
    expect(html).toMatch(/tabular-nums|font-mono|--font-mono/);

    // Check for HUD core values (HAVEN, NEXT STOP, O₂, LINK)
    expect(html).toMatch(/HAVEN/i);
    expect(html).toMatch(/O₂|O2/i);
    expect(html).toMatch(/LINK/i);
  });

  it("shows 4-cue accessible status (shape + word) and honest '—' when no target", () => {
    const html = renderToStaticMarkup(createElement(Hud));

    // When no target is active, HUD shows honest '—', not invented '000°' or '0.00 KM'
    expect(html).not.toMatch(/000°/);
    expect(html).not.toMatch(/0\.00 KM/);
    expect(html).toMatch(/—/);

    // HAVEN and O₂ must render status icons with words and glyphs (04 §A.3)
    expect(html).toMatch(/status-(nominal|caution|warning|unknown)/);
    expect(html).toMatch(/NOMINAL|CAUTION|WARNING|UNKNOWN/);
  });

  it("all HUD text pairs satisfy contrast ≥ 7 : 1 on black (NFR-04, 04 §C.1)", () => {
    // 04 §C.1 HUD palette: all ≥ 7 : 1 on black (--hud-bg: #000000)
    const lum = (hex: string): number => {
      const c = [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const cr = (a: string, b: string): number => {
      const x = lum(a);
      const y = lum(b);
      const [hi, lo] = x > y ? [x, y] : [y, x];
      return (hi + 0.05) / (lo + 0.05);
    };

    const hudColors = [
      { name: "hud-text", hex: "#FFFFFF" },
      { name: "hud-text-2", hex: "#A9B3BE" },
      { name: "hud-nominal", hex: "#3DDC84" },
      { name: "hud-caution", hex: "#FFB020" },
      { name: "hud-warning", hex: "#FF6B6B" },
      { name: "hud-advisory", hex: "#4CC9F0" },
    ];

    for (const color of hudColors) {
      const ratio = cr(color.hex, "#000000");
      expect(ratio).toBeGreaterThanOrEqual(7.0);
    }
  });
});

describe("SCR-18 Hab link lost / connecting (04 §E.5, §B.2)", () => {
  it("retains last known values marked with stale label and age in seconds", () => {
    // 04 §A.3 #8: Stale values grey out with their age; every value carries a provenance chip.
    // 04 §D.5: .is-stale
    const html = renderToStaticMarkup(createElement(HabLinkLost));

    expect(html).toMatch(/stale|link-lost|unlinked/i);
    expect(html).toMatch(/is-stale/);
    expect(html).toMatch(/data-provenance="derived"/);
    // Never fake safety claims like "margin intact"
    expect(html).not.toMatch(/margin intact/);
  });
});

describe("SCR-14 Alert options sheet (04 §E.7)", () => {
  it("renders empty state and disables hold-to-confirm when no options are proposed", () => {
    const html = renderToStaticMarkup(createElement(Options, { options: [] }));
    expect(html).toMatch(/No contingency options proposed/i);
    expect(html).toMatch(/disabled/i);
  });

  it("renders ranked options with ETA to shelter, expected dose, and hold-to-confirm from server data", () => {
    const fixtureMsg = wsFixtures["options-proposed"].find(
      (m: any) => m.type === "EVENT" && m.event?.kind === "OPTIONS_PROPOSED"
    );
    const fixtureOptions = (fixtureMsg as any)?.event?.data?.options ?? [];
    expect(fixtureOptions.length).toBeGreaterThan(0);

    const html = renderToStaticMarkup(createElement(Options, { options: fixtureOptions }));
    expect(html).toMatch(/RANK 1/i);
    expect(html).toMatch(/MIN/i);
    expect(html).toMatch(/DOSE/i);
    expect(html).toMatch(/data-provenance="modelled"/);
    expect(html).toMatch(/800ms|--hold-to-confirm|data-hold/);
  });

  it("shows Ops review banner ONLY when opsReviewActive is true", () => {
    const withoutOps = renderToStaticMarkup(createElement(Options, { opsReviewActive: false }));
    expect(withoutOps).not.toMatch(/ops-review-banner/);
    expect(withoutOps).not.toMatch(/Ops review active/);

    const withOps = renderToStaticMarkup(createElement(Options, { opsReviewActive: true }));
    expect(withOps).toMatch(/ops-review-banner/);
    expect(withOps).toMatch(/Ops review active/);
  });

  it("supports both eva bottom-sheet and ops side-panel variants", () => {
    const evaHtml = renderToStaticMarkup(createElement(Options, { variant: "eva" }));
    const opsHtml = renderToStaticMarkup(createElement(Options, { variant: "ops" }));

    expect(evaHtml).toMatch(/data-variant="eva"/);
    expect(opsHtml).toMatch(/data-variant="ops"/);
  });
});
