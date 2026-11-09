import { describe, it, expect } from "vitest";
import { renderStatusIcon, StatusIcon, STATUS_GLYPHS, STATUS_WORDS } from "../../src/ui/components/statusIcon";
import { renderToString } from "react-dom/server";

describe("T13.05 statusIcon component and renderer", () => {
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
    expect(blocked.querySelector(".status-glyph")?.textContent).toBe("⬣");

    const unknown = renderStatusIcon("unknown");
    expect(unknown.querySelector(".status-glyph")?.textContent).toBe("?");
  });

  it("renders React StatusIcon component with match", () => {
    const htmlStatic = renderToString(StatusIcon({ status: "warning", live: false }));
    expect(htmlStatic).toContain("status-warning");
    expect(htmlStatic).toContain("⬣");
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
});
