import { maxImagePixels } from "./import-photo";
import { adjustPixels, validateAdjustments, type PhotoAdjustments } from "./photo-adjustments";

export async function renderAdjustedPhoto(source: Blob, adjustments: PhotoAdjustments) {
  const { brightness, contrast } = validateAdjustments(adjustments);
  if (brightness === 0 && contrast === 0) return source;
  if (typeof document === "undefined") throw new Error("Photo adjustments require a browser.");

  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  try {
    if (bitmap.width * bitmap.height > maxImagePixels) throw new Error("This photo exceeds the adjustment pixel limit.");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("The browser couldn’t adjust this photo.");
    context.drawImage(bitmap, 0, 0);
    // Work in strips to avoid another full-resolution RGBA allocation.
    const stripHeight = Math.max(1, Math.floor(1_000_000 / canvas.width));
    for (let y = 0; y < canvas.height; y += stripHeight) {
      const height = Math.min(stripHeight, canvas.height - y);
      const image = context.getImageData(0, y, canvas.width, height);
      adjustPixels(image.data, adjustments);
      context.putImageData(image, 0, y);
    }
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser couldn’t save the adjusted photo."));
      }, "image/png");
    });
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
