import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { installDom, removeDom } from "./domHarness";
import { renderStatusIcon, StatusIcon, STATUS_GLYPHS, STATUS_WORDS } from "../../src/ui/components/statusIcon";
import { renderToString } from "react-dom/server";

describe("T13.05 statusIcon component and renderer", () => {
  // The DOM renderer runs against a real jsdom document, not a hand-written stand-in (04 §A.3, §E).
  beforeAll(() => installDom());
  afterAll(() => removeDom());

  it("renders DOM element with 4-cue accessible indicator (✓ circle for nominal/ok)", () => {
    const el = renderStatusIcon("nominal");
    expect(el.className).toContain("status-nominal");
    expect(el.getAttribute("data-status")).toBe("nominal");
    expect(el.getAttribute("role")).toBeNull(); // not live by default

    const glyph = el.querySelector(".status-glyph");
    expect(glyph).not.toBeNull();
    expect(glyph?.textContent).toBe(STATUS_GLYPHS.nominal);
    expect(glyph?.getAttribute("aria-hidden")).toBe("true");

    const label = el.querySelector(".status-label");
    expect(label?.textContent).toBe(STATUS_WORDS.nominal);
  });

  it("applies role='status' only when live is true", () => {
    const staticEl = renderStatusIcon("caution", { live: false });
    expect(staticEl.getAttribute("role")).toBeNull();

    const liveEl = renderStatusIcon("caution", { live: true });
    expect(liveEl.getAttribute("role")).toBe("status");
  });

  it("renders shapes correctly for all 4 primary statuses", () => {
    const ok = renderStatusIcon("ok");
    expect(ok.querySelector(".status-glyph")?.textContent).toBe("✓");

    const caution = renderStatusIcon("caution");
    expect(caution.querySelector(".status-glyph")?.textContent).toBe("▲");

    const blocked = renderStatusIcon("blocked");
    // 04 §C.1 says "octagon": it is drawn as an SVG polygon (FD-208), not the hexagon character U+2B23.
    expect(blocked.querySelector(".status-glyph svg polygon")).not.toBeNull();

    const unknown = renderStatusIcon("unknown");
    expect(unknown.querySelector(".status-glyph")?.textContent).toBe("?");
  });

  it("renders React StatusIcon component with match", () => {
    const htmlStatic = renderToString(StatusIcon({ status: "warning", live: false }));
    expect(htmlStatic).toContain("status-warning");
    expect(htmlStatic).toContain("<polygon");
    expect(htmlStatic).toContain("WARNING");
    expect(htmlStatic).not.toContain('role="status"');

    const htmlLive = renderToString(StatusIcon({ status: "warning", live: true }));
    expect(htmlLive).toContain('role="status"');
  });

  it("supports icon-only display with accessible aria-label", () => {
    const el = renderStatusIcon("nominal", { showWord: false });
    expect(el.querySelector(".status-label")).toBeNull();
    expect(el.getAttribute("aria-label")).toBe("NOMINAL");
    expect(el.querySelector(".status-glyph")?.getAttribute("aria-hidden")).toBe("false");
  });

  it("statusIcon: DOM branch renders colour+shape+word", () => {
    const el = renderStatusIcon("caution");
    // A real element from the jsdom document, not a stand-in object.
    expect(el).toBeInstanceOf(window.HTMLElement);
    expect(el.ownerDocument).toBe(document);
    // colour (status class that patterns.css colours), shape (glyph), word (label), fixed position (glyph first).
    expect(el.classList.contains("status-indicator")).toBe(true);
    expect(el.classList.contains("status-caution")).toBe(true);
    expect(el.children[0].className).toBe("status-glyph");
    expect(el.children[0].textContent).toBe("▲");
    expect(el.children[1].className).toBe("status-label");
    expect(el.children[1].textContent).toBe("CAUTION");
    expect(el.textContent).toBe("▲CAUTION");
    document.body.appendChild(el);
    expect(document.querySelector("[data-status='caution'] .status-label")).toBe(el.children[1]);
    el.remove();
  });

  it("statusIcon: showWord=false has role=img and aria-label", () => {
    const el = renderStatusIcon("blocked", { showWord: false });
    expect(el.getAttribute("aria-label")).toBe("BLOCKED");
    expect(el.getAttribute("role")).toBe("img");
    // live wins: a live icon-only indicator keeps role=status and still carries its accessible name.
    const live = renderStatusIcon("blocked", { showWord: false, live: true });
    expect(live.getAttribute("role")).toBe("status");
    expect(live.getAttribute("aria-label")).toBe("BLOCKED");
    // React variant agrees.
    const html = renderToString(StatusIcon({ status: "blocked", showWord: false }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="BLOCKED"');
    // With the word shown there is no img role and no aria-label.
    const withWord = renderStatusIcon("blocked");
    expect(withWord.getAttribute("role")).toBeNull();
    expect(withWord.getAttribute("aria-label")).toBeNull();
  });

  it("statusIcon: renderStatusIcon needs a DOM (no hand-written mock path)", () => {
    removeDom();
    try {
      expect(() => renderStatusIcon("ok")).toThrow(/DOM/);
    } finally {
      installDom();
    }
  });
});
