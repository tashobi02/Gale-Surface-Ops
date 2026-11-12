/**
 * Rendered text contrast in real Chromium (T13.12, NFR-04). Reads the computed `color` of every visible text node's element
 * and the effective background behind it, then reuses the WCAG maths of `tests/ui/wcag.ts`.
 *
 * Effective background: the element's ancestors' `background-color`s composited from the nearest opaque one outward, the
 * ancestors' `opacity` applied to the text. An element with a `background-image` (a status pattern) is measured against its
 * `background-color` and reported as `patterned`: the 04 §C.1 pills are tuned by `patterns.test.ts` (FD-155), not here.
 */
import type { Page } from "@playwright/test";
import { ratio, type Rgb } from "../../tests/ui/wcag";

export interface TextSample {
  /** First characters of the text, for the failure message. */
  text: string;
  selector: string;
  fg: Rgb;
  bg: Rgb;
  fontPx: number;
  bold: boolean;
  patterned: boolean;
}

export interface ContrastThresholds {
  /** Normal text, BRIEF/OPS/PRINT. */
  text: number;
  /** Large text (at least 24 px, or 18.66 px and bold: WCAG large-text definition). */
  large: number;
  /** HUD routes (`<html data-mode="hud">`). */
  hud: number;
}

export interface ContrastFailure extends TextSample {
  ratio: number;
  required: number;
}

/** Collect one sample per visible text-bearing element. Runs in the page. */
export async function textSamples(page: Page): Promise<{ mode: string | null; samples: TextSample[] }> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    // The canvas resolves any CSS colour (rgb, rgba, color-mix, named) to 8-bit RGBA.
    const parse = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const over = (top: [number, number, number, number], under: [number, number, number]): [number, number, number] => [
      top[0] * top[3] + under[0] * (1 - top[3]),
      top[1] * top[3] + under[1] * (1 - top[3]),
      top[2] * top[3] + under[2] * (1 - top[3]),
    ];
    const selectorOf = (el: Element): string => {
      const parts: string[] = [];
      for (let n: Element | null = el; n && n !== document.body && parts.length < 4; n = n.parentElement) {
        parts.unshift(n.tagName.toLowerCase() + (n.id ? `#${n.id}` : "") + (n.classList.length ? `.${n.classList[0]}` : ""));
      }
      return parts.join(" > ");
    };

    const seen = new Set<Element>();
    const samples: {
      text: string;
      selector: string;
      fg: [number, number, number];
      bg: [number, number, number];
      fontPx: number;
      bold: boolean;
      patterned: boolean;
    }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? "";
      const el = node.parentElement;
      if (!text || !el || seen.has(el)) continue;
      if (el.closest("script, style, noscript, [disabled], [aria-disabled=true], [aria-hidden=true]")) continue;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden" || style.display === "none") continue;
      seen.add(el);

      // Background: climb to the first opaque ancestor background, then composite back down.
      const layers: [number, number, number, number][] = [];
      let patterned = false;
      let opacity = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        opacity *= Number(s.opacity);
        if (n === el && s.backgroundImage !== "none") patterned = true;
        const bg = parse(s.backgroundColor);
        if (bg[3] > 0) layers.push(bg);
        if (bg[3] === 1) break;
      }
      let bg: [number, number, number] = [255, 255, 255];
      for (let i = layers.length - 1; i >= 0; i -= 1) bg = over(layers[i], bg);
      const fgRaw = parse(style.color);
      const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * opacity], bg);
      samples.push({
        text: text.slice(0, 40),
        selector: selectorOf(el),
        fg,
        bg,
        fontPx: parseFloat(style.fontSize),
        bold: Number(style.fontWeight) >= 700,
        patterned,
      });
    }
    return { mode: document.documentElement.dataset.mode ?? null, samples };
  });
}

/** Every sample below its threshold. The threshold is `hud` on a HUD page, else `large` or `text` by font size and weight. */
export function contrastFailures(mode: string | null, samples: readonly TextSample[], limits: ContrastThresholds): ContrastFailure[] {
  const out: ContrastFailure[] = [];
  for (const s of samples) {
    const large = s.fontPx >= 24 || (s.fontPx >= 18.66 && s.bold);
    const required = mode === "hud" ? limits.hud : large ? limits.large : limits.text;
    const r = ratio(s.fg, s.bg);
    if (r < required) out.push({ ...s, ratio: r, required });
  }
  return out;
}

/** Fails, listing the first failures, when any visible text on the page is below `limits` (e.g. `{text: 4.5, large: 3, hud: 7}`). */
export async function expectContrast(page: Page, limits: ContrastThresholds): Promise<number> {
  const { mode, samples } = await textSamples(page);
  const failures = contrastFailures(mode, samples, limits);
  if (failures.length > 0) {
    const lines = failures
      .slice(0, 20)
      .map((f) => `${f.ratio.toFixed(2)} < ${f.required} "${f.text}" (${f.selector}${f.patterned ? ", patterned" : ""}, ${f.fontPx}px)`);
    const more = failures.length > 20 ? `\n  ... and ${failures.length - 20} more` : "";
    throw new Error(`${failures.length} of ${samples.length} text sample(s) below contrast (mode ${String(mode)}):\n  ${lines.join("\n  ")}${more}`);
  }
  return samples.length;
}
