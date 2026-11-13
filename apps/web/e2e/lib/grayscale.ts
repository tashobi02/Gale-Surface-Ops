/**
 * Grayscale signatures (U-41, UT-4; 04 "status recognisable in a grayscale screenshot", FR-08).
 *
 * A locator is screenshotted, decoded in a blank scratch page (no app CSP in the way), reduced to Rec. 709 luma and
 * averaged into a 16 x 16 grid. Two statuses that differ only by colour hue but not luma give the same signature.
 */
import type { Locator, Page } from "@playwright/test";

export const SIGNATURE_SIDE = 16;

/** Mean absolute difference, in 8-bit luma levels, between two signatures. */
export function lumaDelta(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error(`signatures differ in length (${a.length} vs ${b.length})`);
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Luma signature of PNG bytes, decoded and reduced inside `scratch` (an about:blank page). */
export async function signatureOfPng(scratch: Page, png: Buffer): Promise<number[]> {
  return scratch.evaluate(
    async ({ base64, side }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, side, side);
      const data = ctx.getImageData(0, 0, side, side).data;
      const out: number[] = [];
      for (let i = 0; i < data.length; i += 4) out.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
      return out;
    },
    { base64: png.toString("base64"), side: SIGNATURE_SIDE },
  );
}

/** Signatures of several locators, keyed by the caller's names. */
export async function lumaSignatures(page: Page, named: Record<string, Locator>): Promise<Record<string, number[]>> {
  const scratch = await page.context().newPage();
  try {
    const out: Record<string, number[]> = {};
    for (const [name, locator] of Object.entries(named)) out[name] = await signatureOfPng(scratch, await locator.screenshot());
    return out;
  } finally {
    await scratch.close();
  }
}

/**
 * Fails when any two signatures differ by less than `minDelta` luma levels (mean absolute difference). The caller states the
 * floor; `0 < minDelta` means "not pixel-identical in grayscale", which is the claim FD-020 makes for the advisory/unknown pair.
 */
export function expectDistinct(signatures: Record<string, readonly number[]>, minDelta: number): void {
  const names = Object.keys(signatures);
  const close: string[] = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      const delta = lumaDelta(signatures[names[i]], signatures[names[j]]);
      if (delta < minDelta) close.push(`${names[i]} / ${names[j]}: ${delta.toFixed(2)} < ${minDelta}`);
    }
  }
  if (close.length > 0) throw new Error(`grayscale signatures not distinct:\n  ${close.join("\n  ")}`);
}
