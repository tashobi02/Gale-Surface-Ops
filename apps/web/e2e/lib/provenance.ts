/**
 * Provenance coverage (FR-15, NFR-05, T12.06; FD-110): every number on screen must sit inside an element that carries both
 * `data-provenance` and `data-source`, unless it is an identifier or chrome.
 */
import type { Page } from "@playwright/test";

/**
 * FD-110 allowlist: identifiers and chrome are not measurements. `[data-identifier]` is the documented hook; the scale line,
 * the `?debug=1` overlay and SCR-09 equation blocks have no agreed hook yet, so the likely ones are listed.
 * TODO(verify): replace the guessed hooks with the real ones when packages 04, 07 and 15 land.
 */
export const PROVENANCE_ALLOWLIST = [
  "[data-identifier]",
  ".ol-scale-line",
  "[data-scale-line]",
  "[data-debug-overlay]",
  "[data-equation]",
] as const;

export interface UnlabelledNumber {
  text: string;
  selector: string;
}

/**
 * Text nodes with a digit whose element and ancestors lack `data-provenance` + `data-source` and are not allowlisted.
 * `scope` is an optional CSS selector: only the text inside the elements it matches is looked at (the whole page without it). A scope
 * that matches nothing throws, so a renamed container cannot make a check pass by looking at nothing.
 */
export async function unlabelledNumbers(page: Page, allowlist: readonly string[] = PROVENANCE_ALLOWLIST, scope?: string): Promise<UnlabelledNumber[]> {
  return page.evaluate(({ allow, within }) => {
    const out: { text: string; selector: string }[] = [];
    const skip = ["script", "style", "noscript", "title", ...allow].join(", ");
    const roots = within === null ? [document.body] : [...document.querySelectorAll(within)];
    if (roots.length === 0) throw new Error(`provenance scope "${within}" matches nothing`);
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim() ?? "";
        const el = node.parentElement;
        if (!text || !/\d/.test(text) || !el) continue;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || style.display === "none") continue;
        if (el.closest(skip)) continue;
        if (el.closest("[data-provenance][data-source]")) continue;
        const parts: string[] = [];
        for (let n: Element | null = el; n && n !== document.body && parts.length < 4; n = n.parentElement) {
          parts.unshift(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : "") + (n.classList.length ? `.${n.classList[0]}` : ""));
        }
        out.push({ text: text.slice(0, 40), selector: parts.join(" > ") });
      }
    }
    return out;
  }, { allow: allowlist, within: scope ?? null });
}

/** Fails, listing each unlabelled number, unless every number on the page (or inside `scope`) is labelled or allowlisted. */
export async function expectNoUnlabelledNumbers(page: Page, where: string, scope?: string): Promise<void> {
  const bad = await unlabelledNumbers(page, PROVENANCE_ALLOWLIST, scope);
  if (bad.length > 0) {
    throw new Error(`${bad.length} unlabelled number(s) on ${where}:\n  ${bad.slice(0, 20).map((b) => `"${b.text}" (${b.selector})`).join("\n  ")}`);
  }
}
