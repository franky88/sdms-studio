import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { exportPdf } from "../src/features/print/export-pdf";
import { buildPrintDocument, effectiveDpi, gridFor, initialCrop, mmToPt, sourceCrop, type PhotoLine, type PrintSettings } from "../src/features/print/geometry";
import { photoPresets } from "../src/features/print/presets";

const settings: PrintSettings = {
  paper: { widthMm: 210, heightMm: 297 },
  photo: { widthMm: 50.8, heightMm: 50.8 },
  margin: 5,
  gap: 3,
  cutMarks: false,
};
const image: PhotoLine = {
  assetId: "test-image",
  width: 4,
  height: 2,
  copies: 16,
  cropSettings: { ...initialCrop, horizontal: 100 },
};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAFElEQVR4nGP8zwACjAwgmgnMhgIAKjcCA84vINUAAAAASUVORK5CYII=", "base64");
const assets = new Map([[image.assetId, {
  width: 4, height: 2, mime: "image/png" as const, blob: new Blob([png], { type: "image/png" }),
}]]);

describe("Quick Print geometry", () => {
  it("fits 15 exact-size photos on A4 and paginates in input order", () => {
    expect(mmToPt(25.4)).toBeCloseTo(72);
    expect(gridFor(settings)).toEqual({ columns: 3, rows: 5, capacity: 15 });
    const document = buildPrintDocument(settings, [
      { ...image, copies: 12 },
      { ...image, assetId: "second-image", copies: 4 },
    ]);
    expect(document.pages.map((page) => page.photos.length)).toEqual([15, 1]);
    expect(document.pages[0].photos[11].assetId).toBe(image.assetId);
    expect(document.pages[0].photos[12].assetId).toBe("second-image");
    expect(document.pages[1].photos[0]).toMatchObject({ xMm: 5, yMm: 5, widthMm: 50.8, heightMm: 50.8 });
  });

  it("rejects impossible layouts and fractional copies", () => {
    expect(() => buildPrintDocument({ ...settings, margin: 100 }, [image])).toThrow("won’t fit");
    expect(() => buildPrintDocument(settings, [{ ...image, copies: 1.5 }])).toThrow("copies per photo");
    expect(buildPrintDocument(settings, []).pages).toEqual([]);
  });

  it("keeps a source-pixel crop inside its image and calculates effective DPI", () => {
    expect(sourceCrop(image, settings.photo, image.cropSettings)).toEqual({ x: 2, y: 0, width: 2, height: 2 });
    const crop = sourceCrop({ width: 800, height: 1600 }, settings.photo, { ...initialCrop, zoom: 2 });
    expect(crop).toEqual({ x: 200, y: 600, width: 400, height: 400 });
    expect(effectiveDpi(crop, settings.photo)).toBe(200);
  });

  it("keeps cut guides within the sheet and out of adjacent photos", () => {
    const page = buildPrintDocument({ ...settings, cutMarks: true }, [image]).pages[0];
    expect(page.marks.length).toBeGreaterThan(0);
    for (const mark of page.marks) {
      for (const { xMm, yMm } of mark) {
        expect(xMm).toBeGreaterThanOrEqual(0);
        expect(yMm).toBeGreaterThanOrEqual(0);
        expect(xMm).toBeLessThanOrEqual(page.widthMm);
        expect(yMm).toBeLessThanOrEqual(page.heightMm);
        expect(page.photos.some((photo) =>
          xMm > photo.xMm && xMm < photo.xMm + photo.widthMm &&
          yMm > photo.yMm && yMm < photo.yMm + photo.heightMm)).toBe(false);
      }
    }
  });
});

describe("Quick Print PDF", () => {
  it("exports the correct page boxes and clips the embedded original to a 144-point square", async () => {
    const pdf = await PDFDocument.load(await exportPdf(buildPrintDocument(settings, [image]), assets));
    expect(pdf.getPageCount()).toBe(2);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo(mmToPt(210), 7);
      expect(page.getHeight()).toBeCloseTo(mmToPt(297), 7);
    }
    const page = pdf.getPage(1);
    const contents = page.node.Contents();
    expect(contents).toBeInstanceOf(PDFArray);
    const stream = (contents as PDFArray).lookup(0, PDFRawStream);
    const operators = new TextDecoder().decode(decodePDFRawStream(stream).decode());
    const clipBox = operators.match(/([\d.]+) ([\d.]+) (144) (144) re\s+W\s+n/);
    expect(clipBox).not.toBeNull();
    expect(Number(clipBox?.[1])).toBeCloseTo(mmToPt(5), 7);
    expect(Number(clipBox?.[2])).toBeCloseTo(mmToPt(297 - 5 - 50.8), 7);
    expect(operators).toContain("288 0 0 144 0 0 cm");
    expect(operators).toContain(`1 0 0 1 ${mmToPt(5) - 144} `);
  });

  it("preserves an exact-fit landscape 4R sheet", async () => {
    const paper = { widthMm: 152.4, heightMm: 101.6 };
    const document = buildPrintDocument({ ...settings, paper, photo: paper, margin: 0, gap: 0 }, [{ ...image, copies: 1 }]);
    const pdf = await PDFDocument.load(await exportPdf(document, assets));
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(432, 7);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(288, 7);
  });

  it("fails clearly when a photo is missing", async () => {
    await expect(exportPdf(buildPrintDocument(settings, [image]), new Map())).rejects.toThrow("source photo is missing");
  });
});

describe("Mixed photo sizes", () => {
  const small = { widthMm: 25.4, heightMm: 25.4 };
  const large = { widthMm: 50.8, heightMm: 50.8 };

  it("puts 1x1 and 2x2 copies of the same source on one sheet with independent crops", () => {
    const lines = [
      { ...image, id: "small", photo: small, copies: 8, cropSettings: initialCrop },
      { ...image, id: "large", photo: large, copies: 4 },
    ];
    const document = buildPrintDocument(settings, lines);
    expect(document).toEqual(buildPrintDocument(settings, lines));
    expect(document.pages).toHaveLength(1);
    const photos = document.pages[0].photos;
    expect(photos.filter((photo) => photo.lineId === "small")).toHaveLength(8);
    expect(photos.filter((photo) => photo.lineId === "large")).toHaveLength(4);
    expect(photos[0]).toMatchObject({ widthMm: 25.4, heightMm: 25.4, crop: { x: 1 } });
    expect(photos[8]).toMatchObject({ widthMm: 50.8, heightMm: 50.8, crop: { x: 2 } });
  });

  it("preserves quantities, gaps, margins, crops and cut guides across mixed pages", () => {
    const lines = [
      { ...image, id: "4r", photo: { widthMm: 101.6, heightMm: 152.4 }, copies: 7 },
      { ...image, id: "1x1", photo: small, copies: 30 },
      { ...image, id: "2x2", photo: large, copies: 20 },
      { ...image, id: "35x45", photo: { widthMm: 35, heightMm: 45 }, copies: 11 },
    ];
    for (const gap of [0, 3, 8]) {
      const document = buildPrintDocument({ ...settings, gap, cutMarks: true }, lines);
      const allPhotos = document.pages.flatMap((page) => page.photos);
      for (const line of lines) {
        expect(allPhotos.filter((photo) => photo.lineId === line.id)).toHaveLength(line.copies);
      }
      expect(document.pages.length).toBeGreaterThan(1);
      for (const page of document.pages) {
        page.photos.forEach((photo, index) => {
          expect(photo.xMm).toBeGreaterThanOrEqual(settings.margin - 1e-8);
          expect(photo.yMm).toBeGreaterThanOrEqual(settings.margin - 1e-8);
          expect(photo.xMm + photo.widthMm).toBeLessThanOrEqual(page.widthMm - settings.margin + 1e-8);
          expect(photo.yMm + photo.heightMm).toBeLessThanOrEqual(page.heightMm - settings.margin + 1e-8);
          expect(photo.crop.width / photo.crop.height).toBeCloseTo(photo.widthMm / photo.heightMm, 8);
          for (const other of page.photos.slice(index + 1)) {
            const separated = photo.xMm + photo.widthMm + gap <= other.xMm + 1e-8 ||
              other.xMm + other.widthMm + gap <= photo.xMm + 1e-8 ||
              photo.yMm + photo.heightMm + gap <= other.yMm + 1e-8 ||
              other.yMm + other.heightMm + gap <= photo.yMm + 1e-8;
            expect(separated).toBe(true);
          }
        });
        for (const [start, end] of page.marks) {
          for (const point of [start, end]) {
            expect(point.xMm).toBeGreaterThanOrEqual(0);
            expect(point.yMm).toBeGreaterThanOrEqual(0);
            expect(point.xMm).toBeLessThanOrEqual(page.widthMm);
            expect(point.yMm).toBeLessThanOrEqual(page.heightMm);
            expect(page.photos.some((photo) =>
              point.xMm > photo.xMm + 1e-8 && point.xMm < photo.xMm + photo.widthMm - 1e-8 &&
              point.yMm > photo.yMm + 1e-8 && point.yMm < photo.yMm + photo.heightMm - 1e-8)).toBe(false);
          }
        }
      }
    }
  });

  it("validates the actual line sizes even when the default size differs", () => {
    const huge = { widthMm: 609.6, heightMm: 914.4 };
    expect(buildPrintDocument({ ...settings, photo: huge }, [{ ...image, copies: 1, photo: small }]).pages).toHaveLength(1);
    expect(() => buildPrintDocument(settings, [
      { ...image, photo: small, copies: 1 },
      { ...image, photo: huge, copies: 1 },
    ])).toThrow("won’t fit");
  });

  it("retains the page limit for mixed jobs", () => {
    const paper = { widthMm: 60, heightMm: 60 };
    expect(() => buildPrintDocument({ ...settings, paper, margin: 0, gap: 0 }, [
      { ...image, copies: 1000, photo: large },
      { ...image, copies: 1, photo: small },
    ])).toThrow("exceeds 100 sheets");
  });

  it("exports different physical frame sizes on the same PDF page", async () => {
    const document = buildPrintDocument(settings, [
      { ...image, photo: small, copies: 1 },
      { ...image, photo: large, copies: 1 },
      { ...image, photo: { widthMm: 35, heightMm: 45 }, copies: 1 },
    ]);
    const pdf = await PDFDocument.load(await exportPdf(document, assets));
    expect(pdf.getPageCount()).toBe(1);
    const contents = pdf.getPage(0).node.Contents() as PDFArray;
    const operators = new TextDecoder().decode(decodePDFRawStream(contents.lookup(0, PDFRawStream)).decode());
    const frames = [...operators.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re\s+W\s+n/g)];
    expect(frames).toHaveLength(3);
    expect(Number(frames[0][3])).toBeCloseTo(72, 7);
    expect(Number(frames[1][3])).toBeCloseTo(144, 7);
    expect(Number(frames[2][3])).toBeCloseTo(mmToPt(35), 7);
    expect(Number(frames[2][4])).toBeCloseTo(mmToPt(45), 7);
  });

  it("fits every catalog size at its exact dimensions on matching paper", () => {
    expect(new Set(photoPresets.map((preset) => preset.id)).size).toBe(photoPresets.length);
    for (const preset of photoPresets) {
      const document = buildPrintDocument({ ...settings, paper: preset, margin: 0, gap: 0 }, [
        { ...image, photo: preset, copies: 1 },
      ]);
      expect(document.pages).toHaveLength(1);
      expect(document.pages[0].photos[0]).toMatchObject({
        xMm: 0, yMm: 0, widthMm: preset.widthMm, heightMm: preset.heightMm,
      });
    }
  });
});

describe("Fit all prints to one sheet", () => {
  it("fits sixteen 2x2 prints on A4 and keeps the original sizes available", () => {
    const original = structuredClone(image);
    const fitted = buildPrintDocument({ ...settings, fitToOneSheet: true }, [image]);
    expect(fitted.pages).toHaveLength(1);
    expect(fitted.pages[0].photos).toHaveLength(16);
    expect(fitted.scale).toBeCloseTo(47.75 / 50.8, 10);
    for (const photo of fitted.pages[0].photos) {
      expect(photo.widthMm).toBeCloseTo(47.75, 8);
      expect(photo.heightMm).toBeCloseTo(47.75, 8);
      expect(photo.crop).toEqual(sourceCrop(image, settings.photo, image.cropSettings));
    }
    expect(image).toEqual(original);
    const restored = buildPrintDocument({ ...settings, fitToOneSheet: false }, [image]);
    expect(restored.pages).toHaveLength(2);
    expect(restored.pages[0].photos[0].widthMm).toBe(50.8);
  });

  it("scales mixed frames together while preserving copies, crops, margins and gaps", () => {
    const lines = [
      { ...image, id: "4r", copies: 4, photo: { widthMm: 101.6, heightMm: 152.4 } },
      { ...image, id: "2x2", copies: 8, photo: { widthMm: 50.8, heightMm: 50.8 } },
      { ...image, id: "1x1", copies: 12, photo: { widthMm: 25.4, heightMm: 25.4 } },
    ];
    const fitted = buildPrintDocument({ ...settings, fitToOneSheet: true, cutMarks: true }, lines);
    expect(fitted).toEqual(buildPrintDocument({ ...settings, fitToOneSheet: true, cutMarks: true }, lines));
    expect(fitted.pages).toHaveLength(1);
    expect(fitted.scale).toBeGreaterThan(0);
    expect(fitted.scale).toBeLessThan(1);
    const page = fitted.pages[0];
    expect(page.photos).toHaveLength(24);
    for (const line of lines) {
      const prints = page.photos.filter((photo) => photo.lineId === line.id);
      expect(prints).toHaveLength(line.copies);
      for (const photo of prints) {
        expect(photo.widthMm).toBeCloseTo(line.photo.widthMm * fitted.scale!, 8);
        expect(photo.heightMm).toBeCloseTo(line.photo.heightMm * fitted.scale!, 8);
        expect(photo.crop.width / photo.crop.height).toBeCloseTo(line.photo.widthMm / line.photo.heightMm, 8);
        expect(photo.crop.x).toBeCloseTo(sourceCrop(line, line.photo, line.cropSettings).x, 8);
        expect(photo.xMm).toBeGreaterThanOrEqual(settings.margin - 1e-8);
        expect(photo.yMm).toBeGreaterThanOrEqual(settings.margin - 1e-8);
        expect(photo.xMm + photo.widthMm).toBeLessThanOrEqual(page.widthMm - settings.margin + 1e-8);
        expect(photo.yMm + photo.heightMm).toBeLessThanOrEqual(page.heightMm - settings.margin + 1e-8);
      }
    }
    page.photos.forEach((photo, index) => {
      for (const other of page.photos.slice(index + 1)) {
        expect(photo.xMm + photo.widthMm + settings.gap <= other.xMm + 1e-8 ||
          other.xMm + other.widthMm + settings.gap <= photo.xMm + 1e-8 ||
          photo.yMm + photo.heightMm + settings.gap <= other.yMm + 1e-8 ||
          other.yMm + other.heightMm + settings.gap <= photo.yMm + 1e-8).toBe(true);
      }
    });
    expect(page.marks.length).toBeGreaterThan(0);
    for (const mark of page.marks) {
      for (const point of mark) {
        expect(point.xMm).toBeGreaterThanOrEqual(0);
        expect(point.yMm).toBeGreaterThanOrEqual(0);
        expect(point.xMm).toBeLessThanOrEqual(page.widthMm);
        expect(point.yMm).toBeLessThanOrEqual(page.heightMm);
        expect(page.photos.some((photo) =>
          point.xMm > photo.xMm + 1e-8 && point.xMm < photo.xMm + photo.widthMm - 1e-8 &&
          point.yMm > photo.yMm + 1e-8 && point.yMm < photo.yMm + photo.heightMm - 1e-8)).toBe(false);
      }
    }
  });

  it("keeps sizes at 100 percent when they already fit", () => {
    for (const lines of [
      [{ ...image, copies: 12 }],
      [{ ...image, copies: 1 }, { ...image, copies: 2, photo: { widthMm: 25.4, heightMm: 25.4 } }],
    ]) {
      const original = buildPrintDocument(settings, lines);
      const fitted = buildPrintDocument({ ...settings, fitToOneSheet: true }, lines);
      expect(fitted.scale).toBe(1);
      expect(fitted.pages).toEqual(original.pages);
    }
    expect(buildPrintDocument({ ...settings, fitToOneSheet: true }, []).pages).toEqual([]);
  });

  it("reduces a photo larger than the paper while retaining its aspect ratio", () => {
    const photo = { widthMm: 609.6, heightMm: 914.4 };
    const fitted = buildPrintDocument({ ...settings, fitToOneSheet: true }, [{ ...image, photo, copies: 1 }]);
    expect(fitted.pages).toHaveLength(1);
    const print = fitted.pages[0].photos[0];
    expect(print.heightMm).toBeCloseTo(287, 8);
    expect(print.widthMm / print.heightMm).toBeCloseTo(2 / 3, 8);
  });

  it("reports when fixed gaps or margins prevent a one-sheet layout", () => {
    expect(() => buildPrintDocument({
      ...settings, paper: { widthMm: 10, heightMm: 10 }, margin: 0, gap: 12, fitToOneSheet: true,
    }, [{ ...image, copies: 2 }])).toThrow("Reduce the gap or the number of copies");
    expect(() => buildPrintDocument({ ...settings, margin: 150, fitToOneSheet: true }, [image])).toThrow("margins leave no space");
  });

  it("exports one PDF sheet with the reduced frame dimensions", async () => {
    const fitted = buildPrintDocument({ ...settings, fitToOneSheet: true }, [image]);
    const pdf = await PDFDocument.load(await exportPdf(fitted, assets));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(mmToPt(210), 7);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(mmToPt(297), 7);
    const contents = pdf.getPage(0).node.Contents() as PDFArray;
    const operators = new TextDecoder().decode(decodePDFRawStream(contents.lookup(0, PDFRawStream)).decode());
    const frames = [...operators.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re\s+W\s+n/g)];
    expect(frames).toHaveLength(16);
    for (const frame of frames) {
      expect(Number(frame[3])).toBeCloseTo(mmToPt(47.75), 7);
      expect(Number(frame[4])).toBeCloseTo(mmToPt(47.75), 7);
    }
  });
});
