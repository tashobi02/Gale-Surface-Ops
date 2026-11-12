/**
 * Geometry helpers: element boxes, touch-target size and spacing (04 §C.3; FD-153).
 * All numbers are CSS pixels from `getBoundingClientRect`; the caller passes the limit, nothing here chooses one.
 */
import type { Page } from "@playwright/test";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every touch target of 04 §C.3: buttons, links, role=button, inputs, selects and tab stops. */
export const TARGET_SELECTOR = 'button, a, [role=button], input, select, [tabindex="0"]';

/** The box of each selector's first visible match, or null when nothing visible matches. */
export async function boxes(page: Page, selectors: readonly string[]): Promise<Record<string, Box | null>> {
  return page.evaluate((list) => {
    const out: Record<string, { x: number; y: number; width: number; height: number } | null> = {};
    for (const selector of list) {
      let found: { x: number; y: number; width: number; height: number } | null = null;
      for (const el of Array.from(document.querySelectorAll(selector))) {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none") {
          found = { x: r.x, y: r.y, width: r.width, height: r.height };
          break;
        }
      }
      out[selector] = found;
    }
    return out;
  }, selectors);
}

/** Fails unless both snapshots have the same keys and every box matches within `tol` pixels (default 0.5). */
export function expectSameBoxes(a: Record<string, Box | null>, b: Record<string, Box | null>, tol = 0.5): void {
  const problems: string[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const p = a[key];
    const q = b[key];
    if (!p || !q) {
      problems.push(`${key}: ${p ? "missing in second" : q ? "missing in first" : "missing in both"}`);
      continue;
    }
    for (const side of ["x", "y", "width", "height"] as const) {
      if (Math.abs(p[side] - q[side]) > tol) problems.push(`${key}.${side}: ${p[side].toFixed(2)} vs ${q[side].toFixed(2)} (tol ${tol})`);
    }
  }
  if (problems.length > 0) throw new Error(`boxes differ:\n  ${problems.join("\n  ")}`);
}

export interface Target {
  /** Short description for failure messages: tag, id, accessible name. */
  label: string;
  box: Box;
}

/** Visible touch targets inside `scope` (a selector, default the whole document), outermost only. */
export async function targets(page: Page, scope = "body"): Promise<Target[]> {
  return page.evaluate(
    ({ scopeSelector, targetSelector }) => {
      const root = document.querySelector(scopeSelector);
      if (!root) return [];
      const all = Array.from(root.querySelectorAll<HTMLElement>(targetSelector)).filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[inert]");
      });
      // A target nested in another target (an icon span in a button) is one control, not two.
      const outer = all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
      return outer.map((el) => {
        const r = el.getBoundingClientRect();
        const name = el.getAttribute("aria-label") ?? el.textContent?.trim().replace(/\s+/g, " ").slice(0, 30) ?? "";
        return {
          label: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${name ? ` "${name}"` : ""}`,
          box: { x: r.x, y: r.y, width: r.width, height: r.height },
        };
      });
    },
    { scopeSelector: scope, targetSelector: TARGET_SELECTOR },
  );
}

/** Fails when any target is smaller than `min` x `min` pixels. */
export function expectTargetSize(list: readonly Target[], min: number): void {
  const small = list.filter((t) => t.box.width < min || t.box.height < min);
  if (small.length > 0) {
    const lines = small.map((t) => `${t.label}: ${t.box.width.toFixed(1)} x ${t.box.height.toFixed(1)}`);
    throw new Error(`${small.length} target(s) below ${min} x ${min} px:\n  ${lines.join("\n  ")}`);
  }
}

/** Clear distance between two boxes: 0 when they touch, negative when they overlap, else the shortest edge gap. */
export function gapBetween(a: Box, b: Box): number {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
  if (dx < 0 && dy < 0) return Math.max(dx, dy);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
}

/** Fails when two targets are closer than `min` pixels (touching or overlapping included). */
export function expectGaps(list: readonly Target[], min: number): void {
  const close: string[] = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const gap = gapBetween(list[i].box, list[j].box);
      if (gap < min) close.push(`${list[i].label} / ${list[j].label}: ${gap.toFixed(1)} px`);
    }
  }
  if (close.length > 0) throw new Error(`${close.length} target pair(s) closer than ${min} px:\n  ${close.join("\n  ")}`);
}
