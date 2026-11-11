import { describe, expect, it } from "vitest";
import { buildPrintDocument, initialCrop } from "../src/features/print/geometry";
import { adjustPixels, initialAdjustments, photoFilter, validateAdjustments } from "../src/features/print/photo-adjustments";
import { renderAdjustedPhoto } from "../src/features/print/render-adjusted-photo";

describe("Brightness and contrast", () => {
  it("leaves neutral pixels and original source bytes intact", async () => {
    const pixels = new Uint8ClampedArray([0, 64, 128, 255, 192, 220, 255, 23]);
    const original = pixels.slice();
    adjustPixels(pixels, initialAdjustments);
    expect(pixels).toEqual(original);
    expect(photoFilter()).toBe("none");
    const source = new Blob(["original photo bytes"]);
    expect(await renderAdjustedPhoto(source, initialAdjustments)).toBe(source);
  });

  it("applies brightness before contrast and preserves alpha", () => {
    const pixels = new Uint8ClampedArray([64, 128, 192, 87, 0, 255, 128, 0]);
    adjustPixels(pixels, { brightness: 20, contrast: 30 });
    expect([...pixels]).toEqual([62, 161, 255, 87, 0, 255, 161, 0]);
    expect(photoFilter({ brightness: 20, contrast: 30 })).toBe("brightness(1.2) contrast(1.3)");
  });

  it("clamps brightness before applying reduced contrast", () => {
    const pixels = new Uint8ClampedArray([64, 128, 192, 33]);
    adjustPixels(pixels, { brightness: 100, contrast: -50 });
    expect([...pixels]).toEqual([128, 191, 191, 33]);
  });

  it("supports the dark and flat-contrast ends of the controls", () => {
    const dark = new Uint8ClampedArray([0, 128, 255, 127]);
    adjustPixels(dark, { brightness: -100, contrast: 0 });
    expect([...dark]).toEqual([0, 0, 0, 127]);
    const flat = new Uint8ClampedArray([0, 128, 255, 127]);
    adjustPixels(flat, { brightness: 0, contrast: -100 });
    expect([...flat]).toEqual([128, 128, 128, 127]);
  });

  it("accepts older entries without adjustments and rejects invalid amounts", () => {
    expect(validateAdjustments()).toEqual(initialAdjustments);
    for (const value of [NaN, Infinity, -101, 101]) {
      expect(() => validateAdjustments({ brightness: value, contrast: 0 })).toThrow("between -100 and 100");
      expect(() => validateAdjustments({ brightness: 0, contrast: value })).toThrow("between -100 and 100");
    }
  });

  it("keeps independent edits on copies of the same source through mixed one-sheet fitting", () => {
    const lines = [
      { id: "bright", assetId: "same-source", width: 1500, height: 1900, copies: 16,
        photo: { widthMm: 50.8, heightMm: 50.8 }, cropSettings: initialCrop,
        adjustments: { brightness: 20, contrast: 30 } },
      { id: "dark", assetId: "same-source", width: 1500, height: 1900, copies: 8,
        photo: { widthMm: 25.4, heightMm: 25.4 }, cropSettings: initialCrop,
        adjustments: { brightness: -20, contrast: 10 } },
    ];
    const original = structuredClone(lines);
    const document = buildPrintDocument({
      paper: { widthMm: 210, heightMm: 297 }, photo: { widthMm: 50.8, heightMm: 50.8 },
      margin: 5, gap: 3, cutMarks: false, fitToOneSheet: true,
    }, lines);
    expect(document.pages).toHaveLength(1);
    for (const line of lines) {
      const prints = document.pages[0].photos.filter((photo) => photo.lineId === line.id);
      expect(prints).toHaveLength(line.copies);
      expect(prints.every((photo) => photo.adjustments === line.adjustments)).toBe(true);
    }
    expect(lines).toEqual(original);
  });
});
