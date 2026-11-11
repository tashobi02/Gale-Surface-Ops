/**
 * Map token colours (04 §C.1, tokens.css "JS/Canvas consumers: read colours with getComputedStyle"). OpenLayers styles
 * draw on a canvas, which cannot resolve `var(--x)`, so the layers read the token value; they never hard-code hex.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tokenColor, tokenFont, tokenNumber, withAlpha } from "../../../src/ui/map/tokenColors";
import { installDom, removeDom } from "../domHarness";
import { applyTokens } from "../tokensDom";

beforeEach(() => installDom());
afterEach(() => removeDom());

describe("tokenColor", () => {
  it("returns the 04 §C.1 value of a token from the document's computed style", () => {
    applyTokens();
    expect(tokenColor("route")).toBe("#4CC9F0");
    expect(tokenColor("void")).toBe("#0B0D10");
    expect(tokenColor("caution")).toBe("#FFB020");
    expect(tokenColor("warning")).toBe("#FF4D4D");
    expect(tokenColor("unknown")).toBe("#B8A9FF");
    expect(tokenColor("text-1")).toBe("#ECEFF2");
  });

  it("follows the document when a token changes (mode layers), not a copy", () => {
    applyTokens();
    document.documentElement.style.setProperty("--route", "#112233");
    expect(tokenColor("route")).toBe("#112233");
  });

  it("throws when tokens.css is not loaded instead of drawing a default colour", () => {
    expect(() => tokenColor("route")).toThrow(/--route is not defined/);
  });
});

describe("tokenFont and tokenNumber", () => {
  it("read the mono font stack and the comm-shadow opacity from the document", () => {
    const tokens = applyTokens();
    expect(tokenFont()).toBe(tokens["--font-mono"]);
    expect(tokenNumber("comm-shadow-opacity")).toBe(0.35);
  });
});

describe("withAlpha", () => {
  it("turns #RRGGBB into rgba() with the given opacity", () => {
    expect(withAlpha("#FF4D4D", 0.35)).toBe("rgba(255, 77, 77, 0.35)");
  });

  it("rejects a colour that is not #RRGGBB and an opacity outside 0..1", () => {
    expect(() => withAlpha("red", 0.5)).toThrow(/#RRGGBB/);
    expect(() => withAlpha("#FFFFFF", 1.5)).toThrow(/opacity/);
  });
});
