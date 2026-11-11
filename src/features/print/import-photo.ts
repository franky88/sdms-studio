import type { PrintAsset } from "./export-pdf";
import type { PixelSize } from "./geometry";

export const maxFiles = 30;
export const maxJobPixels = 100_000_000;
const maxFileBytes = 20_000_000;
export const maxImagePixels = 30_000_000;
const maxImageSide = 12_000;

type PhotoHeader = PixelSize & { mime: PrintAsset["mime"]; normalize: boolean };

function readPng(view: DataView): PhotoHeader | undefined {
  if (view.byteLength < 33 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) return;
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) return;

  let normalize = false;
  for (let offset = 8; offset + 12 <= view.byteLength;) {
    const length = view.getUint32(offset);
    const type = view.getUint32(offset + 4);
    if (offset + 12 + length > view.byteLength) return;
    if (type === 0x6163544c) throw new Error("Animated PNG files aren’t supported.");
    if (type === 0x65584966) normalize = true; // eXIf
    if (type === 0x49454e44) {
      return { width: view.getUint32(16), height: view.getUint32(20), mime: "image/png", normalize };
    }
    offset += 12 + length;
  }
}

function readJpeg(view: DataView): PhotoHeader | undefined {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return;

  const frameMarkers = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf];
  let dimensions: PixelSize | undefined;
  let normalize = false;
  let offset = 2;
  while (offset + 1 < view.byteLength && view.getUint8(offset) === 0xff) {
    const marker = view.getUint8(++offset);
    if (marker === 0xff) continue;
    offset++;
    if (marker === 0xda) break;
    if (offset + 2 > view.byteLength) return;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > view.byteLength) return;
    if (marker === 0xe1 && length >= 8 && view.getUint32(offset + 2) === 0x45786966 &&
        view.getUint16(offset + 6) === 0) {
      normalize = true; // Decode EXIF-oriented files once before preview and export.
    }
    if (frameMarkers.includes(marker) && length >= 8) {
      dimensions = { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      const components = view.getUint8(offset + 7);
      normalize ||= components !== 1 && components !== 3;
    }
    offset += length;
  }
  if (dimensions) return { ...dimensions, mime: "image/jpeg", normalize };
}

function encode(bitmap: ImageBitmap, width: number, height: number, mime: PrintAsset["mime"]) {
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser couldn’t prepare this photo.");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error("The browser couldn’t prepare this photo."));
    }, mime, 0.96);
  });
}

export async function importPhoto(file: File, availablePixels: number) {
  if (file.size > maxFileBytes) throw new Error("Choose a photo under 20 MB.");
  const view = new DataView(await file.arrayBuffer());
  const header = readPng(view) ?? readJpeg(view);
  if (!header) throw new Error("Choose a valid JPEG or PNG photo.");
  const { width, height, mime } = header;
  if (!width || !height || width * height > maxImagePixels || Math.max(width, height) > maxImageSide) {
    throw new Error("Choose a photo under 30 megapixels and 12,000 pixels per side.");
  }
  if (width * height > availablePixels) throw new Error("This job exceeds the 100-megapixel photo limit.");

  const source = file.slice(0, file.size, mime);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo couldn’t be opened. Try exporting it as JPEG or PNG again.");
  }

  try {
    const normalize = header.normalize || bitmap.width !== width || bitmap.height !== height;
    const blob = normalize ? await encode(bitmap, bitmap.width, bitmap.height, mime) : source;
    const scale = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
    const thumbnail = await encode(bitmap, Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)), mime);
    return { blob, mime, width: bitmap.width, height: bitmap.height, thumbnail };
  } finally {
    bitmap.close();
  }
}
