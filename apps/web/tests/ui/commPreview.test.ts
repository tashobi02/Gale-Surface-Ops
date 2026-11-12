/** T32.22: committed comm bytes become pixels, never a second coverage model. */
import { describe, expect, it, vi } from "vitest";

describe("commPreview", () => {
  it("renders grid without resampling science", async () => {
    const { drawCommPreview } = await import("../../src/ui/setup/commPreview");
    const image = { data: new Uint8ClampedArray(16) };
    const context = { createImageData: vi.fn(() => image), putImageData: vi.fn(), imageSmoothingEnabled: true };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement;
    const grid = new Uint8Array([1, 0, 255, 1]); const before = grid.slice();
    drawCommPreview(canvas, grid, 2, 2, { visible: [230, 230, 230], shadow: [30, 30, 30], noData: [76, 201, 240] });
    expect(canvas.width).toBe(2); expect(canvas.height).toBe(2);
    expect(context.imageSmoothingEnabled).toBe(false);
    // No data (255) gets its own fill, not the shadow fill, so the two are told apart (04 §A.3.2).
    expect(Array.from(image.data)).toEqual([230, 230, 230, 255, 30, 30, 30, 255, 76, 201, 240, 255, 230, 230, 230, 255]);
    expect(context.putImageData).toHaveBeenCalledWith(image, 0, 0);
    expect(grid).toEqual(before);
  });

  it("refuses invalid dimensions, byte counts and unknown encodings", async () => {
    const { drawCommPreview } = await import("../../src/ui/setup/commPreview");
    const canvas = {} as HTMLCanvasElement;
    const palette = { visible: [230, 230, 230], shadow: [30, 30, 30], noData: [76, 201, 240] } as const;
    expect(() => drawCommPreview(canvas, new Uint8Array([1]), 2, 2, palette)).toThrow();
    expect(() => drawCommPreview(canvas, new Uint8Array([]), 0, 0, palette)).toThrow();
    expect(() => drawCommPreview(canvas, new Uint8Array([2]), 1, 1, palette)).toThrow();
  });
});
