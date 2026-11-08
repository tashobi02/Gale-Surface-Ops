/**
 * Tests for warnings list (T09.04, 01 FR-10, 04 §C.1, 04 §E, 04 §F).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  renderWarningsList,
  sortWarnings,
  formatWarningLocation,
  type WarningsListOptions,
} from "../../src/ui/results/warningsList";
import type { Warning } from "@marswalk/protocol";
import type { MapHandle } from "../../src/ui/context";

// Lightweight DOM shim for Node environment
class SimpleDOMElement {
  tagName: string;
  className = "";
  innerHTML = "";
  attributes: Record<string, string> = {};
  children: SimpleDOMElement[] = [];
  listeners: Record<string, ((e: any) => void)[]> = {};
  parentElement: SimpleDOMElement | null = null;
  private _text = "";

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    if (this._text) return this._text;
    let text = this.attributes["aria-label"] ?? "";
    for (const c of this.children) {
      text += " " + c.textContent;
    }
    return text.trim();
  }

  set textContent(val: string) {
    this._text = val;
    this.children = [];
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
    if (name === "class") this.className = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  appendChild<T extends SimpleDOMElement>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(event: string, handler: (e: any) => void) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(handler);
  }

  click() {
    for (const l of this.listeners["click"] ?? []) {
      l({ type: "click", preventDefault: () => {} });
    }
  }

  matches(selector: string): boolean {
    let s = selector;
    const attrMatch = s.match(/\[([a-zA-Z0-9_-]+)(?:=['"]([^'"]+)['"])?\]/);
    if (attrMatch) {
      const attr = attrMatch[1];
      const val = attrMatch[2];
      if (val !== undefined) {
        if (this.getAttribute(attr) !== val) return false;
      } else {
        if (this.getAttribute(attr) === null) return false;
      }
      s = s.replace(attrMatch[0], "");
    }
    if (!s) return true;

    const parts = s.split(".");
    const tag = parts[0];
    const classes = parts.slice(1);

    if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) {
      return false;
    }

    if (classes.length > 0) {
      const elClasses = this.className.split(/\s+/);
      for (const cls of classes) {
        if (!elClasses.includes(cls)) return false;
      }
    }

    return true;
  }

  querySelector(selector: string): SimpleDOMElement | null {
    const parts = selector.split(/\s+/);
    if (parts.length > 1) {
      const first = this.querySelector(parts[0]);
      return first ? first.querySelector(parts.slice(1).join(" ")) : null;
    }
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const sub = child.querySelector(selector);
      if (sub) return sub;
    }
    return null;
  }

  querySelectorAll(selector: string): SimpleDOMElement[] {
    const result: SimpleDOMElement[] = [];
    for (const child of this.children) {
      if (child.matches(selector)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
}

describe("T09.04 Warnings List (renderWarningsList)", () => {
  let container: any;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    (globalThis as any).document = {
      createElement: (tag: string) => new SimpleDOMElement(tag),
    };
    container = (globalThis as any).document.createElement("div");
  });

  afterEach(() => {
    (globalThis as any).document = originalDocument;
  });

  const cautionSlopeWarning: Warning = {
    code: "CAUTION_SLOPE",
    severity: "caution",
    leg: 0,
    from_m: 1210,
    to_m: 1290,
    message: "Slope 12.6° exceeds caution 10° for 80 m",
  };

  const walkbackExceededWarning: Warning = {
    code: "WALKBACK_EXCEEDED",
    severity: "blocked",
    leg: null,
    from_m: null,
    to_m: null,
    message: "Max walkback 3.06 km exceeds walkback limit 0.5 km",
  };

  const darknessWarning: Warning = {
    code: "DARKNESS",
    severity: "blocked",
    leg: 1,
    from_m: 500,
    to_m: 800,
    at_utc: "2026-11-14T17:30:00Z",
    message: "Sun sets before arrival at stop 2",
  };

  it("sorts warnings by severity (blocked before caution)", () => {
    const sorted = sortWarnings([cautionSlopeWarning, walkbackExceededWarning]);
    expect(sorted[0].severity).toBe("blocked");
    expect(sorted[1].severity).toBe("caution");
  });

  it("formats warning location for located and unlocated warnings", () => {
    expect(formatWarningLocation(cautionSlopeWarning)).toContain("Leg #1");
    expect(formatWarningLocation(cautionSlopeWarning)).toContain("1210");
    expect(formatWarningLocation(cautionSlopeWarning)).toContain("1290");

    expect(formatWarningLocation(walkbackExceededWarning)).toBe("");
    expect(formatWarningLocation(darknessWarning)).toContain("Leg #2");
  });

  it("renders empty state when no warnings exist", () => {
    renderWarningsList(container, []);
    expect(container.textContent).toContain("No active warnings");
  });

  it("renders severity icon and text for each warning without color alone (04 §E)", () => {
    renderWarningsList(container, [cautionSlopeWarning, walkbackExceededWarning]);

    const items = container.querySelectorAll(".warning-item");
    expect(items.length).toBe(2);

    // Blocked warning (first due to severity sort)
    expect(items[0].getAttribute("data-severity")).toBe("blocked");
    expect(items[0].textContent).toContain("BLOCKED");
    expect(items[0].textContent).toContain("Max walkback");

    // Caution warning
    expect(items[1].getAttribute("data-severity")).toBe("caution");
    expect(items[1].textContent).toContain("CAUTION");
    expect(items[1].textContent).toContain("Slope 12.6°");
  });

  it("located warnings are keyboard-reachable zoom buttons that trigger zoom", () => {
    const onZoom = vi.fn();
    const mapHandle: MapHandle = {
      getMap: vi.fn(),
      fitExtent: vi.fn(),
      setCenter: vi.fn(),
      getCenter: vi.fn((): [number, number] => [0, 0]),
      setZoom: vi.fn(),
      getZoom: vi.fn(() => 12),
      destroy: vi.fn(),
    };

    const options: WarningsListOptions = {
      mapHandle,
      onZoom,
      getLegExtent: vi.fn((): [number, number, number, number] => [100, 200, 300, 400]),
    };

    renderWarningsList(container, [cautionSlopeWarning, walkbackExceededWarning], options);

    // Located warning should be a button
    const zoomBtn = container.querySelector("button.warning-zoom-btn");
    expect(zoomBtn).not.toBeNull();
    expect(zoomBtn.getAttribute("aria-label")).toContain("Zoom to warning");

    // Click triggers zoom
    zoomBtn.click();
    expect(onZoom).toHaveBeenCalledWith(cautionSlopeWarning);
    expect(mapHandle.fitExtent).toHaveBeenCalledWith([100, 200, 300, 400]);

    // Unlocated warning is not a zoom button
    const unlocatedItem = container.querySelector(".warning-item[data-severity='blocked']");
    expect(unlocatedItem?.querySelector("button.warning-zoom-btn")).toBeNull();
  });
});
