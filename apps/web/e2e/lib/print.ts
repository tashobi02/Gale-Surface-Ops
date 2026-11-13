/**
 * Print page counts (T11.05 SCR-08 = 1 page, T27.06 SCR-17 <= 2 pages; A4 and Letter, 12 mm margins).
 * Chromium's own PDF writer lays out the page, so the count is what a browser print would produce.
 *
 * The margin: a stylesheet `@page { margin }` rule is authoritative — Chromium applies it and ignores the
 * `page.pdf({ margin })` option. SCR-08's rule lives in `scr08BriefingCard.css` (a real stylesheet, so the
 * browser sees it; an inline `<style>` is blocked by the app's CSP) and `cssPageMarginApplies` proves it is
 * live rather than silently dead.
 */
import type { Page } from "@playwright/test";

export interface PdfOptions {
  format: "A4" | "Letter";
  /**
   * CSS length applied to all four sides; the packages use 12 mm. `"css"`: no margin is passed and the page's own CSS
   * `@page` rule decides (preferCSSPageSize), as a browser print of that page would.
   */
  margin?: string;
}

export interface PdfPage {
  /** The page box in PostScript points: `[left, bottom, right, top]`. */
  mediaBox: [number, number, number, number];
  /** Number of `/Type /Page` objects (not the `/Type /Pages` tree nodes). */
  pages: number;
}

/** Number of `/Type /Page` objects in a PDF buffer (not the `/Type /Pages` tree nodes). */
export function countPdfPages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
}

/** The first `/MediaBox` of a PDF, in points, or null when the PDF has none. */
export function pdfMediaBox(pdf: Buffer): [number, number, number, number] | null {
  const match = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(pdf.toString("latin1"));
  return match ? [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])] : null;
}

/** Print the page to PDF in print media and count its pages. Restores screen media afterwards. */
export async function pdfPages(page: Page, options: PdfOptions): Promise<number> {
  const margin = options.margin ?? "12mm";
  await page.emulateMedia({ media: "print" });
  try {
    const pdf =
      margin === "css"
        ? await page.pdf({ format: options.format, preferCSSPageSize: true, printBackground: true })
        : await page.pdf({
            format: options.format,
            margin: { top: margin, right: margin, bottom: margin, left: margin },
            printBackground: true,
          });
    return countPdfPages(pdf);
  } finally {
    await page.emulateMedia({ media: null });
  }
}

/**
 * Whether the stylesheet's own `@page { margin }` is the margin Chromium applies.
 *
 * Chromium gives the CSS rule precedence over the `page.pdf({ margin })` option: with a live `@page` rule two
 * different PDF margins produce byte-identical output, and without it they differ. The two renders are sequential
 * on purpose — two concurrent `page.pdf()` calls on one page race and return the same render.
 */
export async function cssPageMarginApplies(page: Page, format: "A4" | "Letter" = "A4"): Promise<boolean> {
  const render = async (margin: string): Promise<Buffer> => {
    await page.emulateMedia({ media: "print" });
    try {
      return await page.pdf({ format, margin: { top: margin, right: margin, bottom: margin, left: margin }, printBackground: true });
    } finally {
      await page.emulateMedia({ media: null });
    }
  };
  const narrow = await render("0mm");
  const wide = await render("40mm");
  return narrow.equals(wide);
}
