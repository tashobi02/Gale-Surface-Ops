/** SCR-20 display only: one north-up u8 grid cell per pixel (05 RoutingGrid; T32.22). */
export interface CommPalette { visible: readonly number[]; shadow: readonly number[]; noData: readonly number[] }

export function drawCommPreview(canvas: HTMLCanvasElement, grid: Uint8Array, width: number, height: number, palette: CommPalette): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || grid.length !== width * height) throw new RangeError("Comm grid dimensions do not match its bytes");
  if (grid.some((byte) => byte !== 0 && byte !== 1 && byte !== 255)) throw new RangeError("Unknown comm grid encoding");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Comm preview canvas is unavailable");
  context.imageSmoothingEnabled = false;
  const image = context.createImageData(width, height);
  for (let i = 0; i < grid.length; i++) {
    // 255 is "no data": it gets its own fill, not the shadow fill, so the two are told apart by colour alone
    // (04 §A.3.2: a non-text cue is colour + shape + word, and the legend names both).
    const rgb = grid[i] === 255 ? palette.noData : grid[i] === 1 ? palette.visible : palette.shadow;
    image.data.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  }
  context.putImageData(image, 0, 0);
}
