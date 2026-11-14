// Flood only the connected backdrop, so a similar color inside the subject
// is retained. This is a plain-background tool, not biometric/AI segmentation.
export function backdropMask(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number, tolerance: number) {
  if (pixels.length !== width * height * 4 || width < 1 || height < 1 || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255) throw new Error("Invalid background selection.");
  const seed = Math.max(0, Math.min(height - 1, Math.round(y))) * width + Math.max(0, Math.min(width - 1, Math.round(x)));
  const target = pixels.slice(seed * 4, seed * 4 + 3);
  const keep = new Uint8ClampedArray(width * height).fill(255);
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0, tail = 1;
  queue[0] = seed; visited[seed] = 1;
  const visit = (next: number) => { if (!visited[next]) { visited[next] = 1; queue[tail++] = next; } };
  while (head < tail) {
    const index = queue[head++], offset = index * 4;
    const distance = Math.max(Math.abs(pixels[offset] - target[0]), Math.abs(pixels[offset + 1] - target[1]), Math.abs(pixels[offset + 2] - target[2]));
    if (pixels[offset + 3] > 0 && distance > tolerance) continue;
    keep[index] = 0;
    if (index % width > 0) visit(index - 1);
    if (index % width < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index + width < width * height) visit(index + width);
  }
  return keep;
}

export function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Couldn’t prepare the background edit.")), "image/png"));
}
