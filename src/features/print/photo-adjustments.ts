export type PhotoAdjustments = { brightness: number; contrast: number };
export const initialAdjustments: PhotoAdjustments = { brightness: 0, contrast: 0 };

export function validateAdjustments(adjustments: PhotoAdjustments = initialAdjustments) {
  if (![adjustments.brightness, adjustments.contrast].every((value) =>
    Number.isFinite(value) && value >= -100 && value <= 100)) {
    throw new Error("Brightness and contrast must be between -100 and 100.");
  }
  return adjustments;
}

export function photoFilter(adjustments?: PhotoAdjustments) {
  const { brightness, contrast } = validateAdjustments(adjustments);
  if (brightness === 0 && contrast === 0) return "none";
  return `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100})`;
}

export function adjustPixels(pixels: Uint8ClampedArray, adjustments: PhotoAdjustments) {
  const { brightness, contrast } = validateAdjustments(adjustments);
  const brightnessFactor = 1 + brightness / 100;
  const contrastFactor = 1 + contrast / 100;
  const lookup = new Uint8Array(256);
  for (let value = 0; value < 256; value++) {
    // Match the preview's sRGB brightness → contrast order, including the
    // clamp between filters. Alpha is preserved.
    const brightened = Math.min(255, value * brightnessFactor);
    lookup[value] = Math.round(Math.max(0, Math.min(255,
      (brightened - 127.5) * contrastFactor + 127.5)));
  }
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = lookup[pixels[index]];
    pixels[index + 1] = lookup[pixels[index + 1]];
    pixels[index + 2] = lookup[pixels[index + 2]];
  }
}

