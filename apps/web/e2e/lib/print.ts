/**
 * Print page counts (T11.05 SCR-08 = 1 page, T27.06 SCR-17 <= 2 pages; A4 and Letter, 12 mm margins).
 * Chromium's own PDF writer lays out the page, so the count is what a browser print would produce.
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

/** Number of `/Type /Page` objects in a PDF buffer (not the `/Type /Pages` tree nodes). */
export function countPdfPages(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?![A-Za-z])/g) ?? []).length;
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
