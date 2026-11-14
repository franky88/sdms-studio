import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import { buildPrintDocument, initialCrop, mmToPt, type PrintSettings } from "../src/features/print/geometry";
import { exportPdf } from "../src/features/print/export-pdf";
import { constrainItem, layoutFromDocument, manualPrintDocument, reconcileManualLayout, rotatedBounds } from "../src/features/studio/manual-layout";
import { createStudioJob, validateStudioJob, type StudioAsset, type StudioJob } from "../src/features/studio/job";
import { createHistory, historyReducer } from "../src/features/studio/history";
import { backdropMask } from "../src/features/studio/background";
import { assetDependencies } from "../src/features/studio/asset-dependencies";
import { createProjectRepository } from "../src/features/studio/project-repository";

const settings: PrintSettings = { paper: { widthMm: 210, heightMm: 297 }, photo: { widthMm: 35, heightMm: 45 }, margin: 5, gap: 3, cutMarks: true };
const job = (): StudioJob => ({ ...createStudioJob(), entries: [{ id: "line", assetId: "original", name: "Portrait.png", width: 1, height: 1, copies: 2, presetId: "id-35x45", photo: settings.photo, cropSettings: initialCrop }] });
const png = new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYncAAAAASUVORK5CYII=", "base64")], { type: "image/png" });
const original: StudioAsset = { id: "original", width: 1, height: 1, blob: png, thumbnail: png, mime: "image/png" };

describe("Manual photo layout", () => {
  it("converts all copies without changing their crop or physical sizes", () => {
    const input = job();
    const automatic = buildPrintDocument(settings, input.entries);
    const layout = layoutFromDocument(automatic);
    const manual = manualPrintDocument(input, settings, layout);
    expect(manual.pages[0].photos).toHaveLength(2);
    manual.pages[0].photos.forEach((photo, index) => {
      expect(photo.widthMm).toBe(35); expect(photo.heightMm).toBe(45);
      expect(photo.crop).toEqual(automatic.pages[0].photos[index].crop);
    });
    layout.pages[0][0] = { ...layout.pages[0][0], xMm: 30, yMm: 40, rotation: 37 };
    layout.pages.push([layout.pages[0].pop()!]);
    const moved = manualPrintDocument(input, settings, layout);
    expect(moved.pages).toHaveLength(2);
    expect(moved.pages[0].photos[0].rotation).toBe(37);
    expect(moved.pages.flatMap((page) => page.photos)).toHaveLength(2);
    moved.pages.flatMap((page) => page.marks.flat()).forEach((point) => {
      expect(point.xMm).toBeGreaterThanOrEqual(0); expect(point.xMm).toBeLessThanOrEqual(210);
      expect(point.yMm).toBeGreaterThanOrEqual(0); expect(point.yMm).toBeLessThanOrEqual(297);
    });
  });

  it("constrains the rotated corners and rejects impossible angles and missing copies", () => {
    const item = { id: "p", lineId: "line", xMm: -100, yMm: 999, rotation: 45 };
    const bounded = constrainItem(item, settings.photo, settings.paper);
    const bounds = rotatedBounds(settings.photo, 45);
    expect(bounded.xMm + 35 / 2 - bounds.widthMm / 2).toBeCloseTo(0);
    expect(bounded.yMm + 45 / 2 + bounds.heightMm / 2).toBeCloseTo(297);
    expect(() => constrainItem(item, { widthMm: 300, heightMm: 300 }, settings.paper)).toThrow("won’t fit");
    const layout = layoutFromDocument(buildPrintDocument(settings, job().entries));
    layout.pages[0].pop();
    expect(() => manualPrintDocument(job(), settings, layout)).toThrow("quantities");
  });

  it("preserves positions for crop/source edits and resets them atomically for structural edits", () => {
    const input = job(); input.manualLayout = layoutFromDocument(buildPrintDocument(settings, input.entries));
    const cropped = reconcileManualLayout(input, { ...input, entries: input.entries.map((entry) => ({ ...entry, assetId: "cutout", cropSettings: { ...initialCrop, zoom: 2 } })) });
    expect(cropped.manualLayout).toBe(input.manualLayout);
    const resized = reconcileManualLayout(input, { ...input, gap: "8" });
    expect(resized.manualLayout).toBeUndefined();
    const history = historyReducer(createHistory(input), { type: "change", job: resized });
    expect(historyReducer(history, { type: "undo" }).present.manualLayout).toBe(input.manualLayout);
    expect(validateStudioJob(input).manualLayout).toEqual(input.manualLayout);
  });

  it("exports clockwise rotation around the frame center while retaining exact crop dimensions", async () => {
    const input = job(); const layout = layoutFromDocument(buildPrintDocument(settings, input.entries));
    layout.pages[0][0] = { ...layout.pages[0][0], xMm: 30, yMm: 40, rotation: 90 };
    const pdf = await PDFDocument.load(await exportPdf(manualPrintDocument(input, settings, layout), new Map([[original.id, original]])));
    const contents = pdf.getPage(0).node.Contents() as PDFArray;
    const operators = new TextDecoder().decode(decodePDFRawStream(contents.lookup(0, PDFRawStream)).decode());
    const firstMatrix = operators.match(/([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) cm/)!;
    const [a, b, c, d, e, f] = firstMatrix.slice(1).map(Number);
    const cx = mmToPt(47.5), cy = mmToPt(234.5);
    expect(a).toBeCloseTo(0); expect(b).toBeCloseTo(-1); expect(c).toBeCloseTo(1); expect(d).toBeCloseTo(0);
    expect(a * cx + c * cy + e).toBeCloseTo(cx); expect(b * cx + d * cy + f).toBeCloseTo(cy);
    const rectangle = operators.match(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re/)!;
    expect(Number(rectangle[3])).toBeCloseTo(mmToPt(35)); expect(Number(rectangle[4])).toBeCloseTo(mmToPt(45));
  });
});

describe("Background cleanup", () => {
  it("removes only the connected selected color, retaining a matching color enclosed inside the subject", () => {
    const values = [255,255,255,255,255, 255,0,0,0,255, 255,0,255,0,255, 255,0,0,0,255, 255,255,255,255,255];
    const pixels = new Uint8ClampedArray(values.flatMap((value) => [value, value, value, 255]));
    const saved = pixels.slice();
    const mask = backdropMask(pixels, 5, 5, 0, 0, 20);
    expect(mask[0]).toBe(0); expect(mask[12]).toBe(255); expect(mask[6]).toBe(255);
    expect([...mask].filter((value) => value === 0)).toHaveLength(16);
    expect(pixels).toEqual(saved);
  });

  it("uses tolerance without erasing disconnected colors", () => {
    const pixels = new Uint8ClampedArray([220,220,220,255, 230,230,230,255, 0,0,0,255, 220,220,220,255]);
    expect([...backdropMask(pixels, 4, 1, 0, 0, 5)]).toEqual([0,255,255,255]);
    expect([...backdropMask(pixels, 4, 1, 0, 0, 15)]).toEqual([0,0,255,255]);
  });

  it("retains original bytes and editable mask through saved-project reconnects", async () => {
    const repo = createProjectRepository(`background-test-${crypto.randomUUID()}`);
    try {
      const edited: StudioAsset = { ...original, id: "cutout", originalId: original.id, backgroundMask: new Blob(["mask pixels"]), backgroundColor: "#1677d2" };
      const input = job(); input.entries = input.entries.map((entry) => ({ ...entry, assetId: edited.id }));
      input.manualLayout = layoutFromDocument(buildPrintDocument(settings, input.entries));
      const assets = new Map([[original.id, original], [edited.id, edited]]);
      expect(assetDependencies([edited.id], assets)).toEqual(new Set([edited.id, original.id]));
      await repo.saveProject("edited", 0, input, assets); await repo.close();
      const loaded = (await repo.loadProject("edited"))!;
      expect(loaded.job.manualLayout).toEqual(input.manualLayout);
      expect(loaded.assets).toHaveLength(2);
      expect(await loaded.assets.find((asset) => asset.id === "cutout")?.backgroundMask?.text()).toBe("mask pixels");
      expect(await loaded.assets.find((asset) => asset.id === "original")?.blob.arrayBuffer()).toEqual(await png.arrayBuffer());
      expect(() => assetDependencies([edited.id], new Map([[edited.id, edited]]))).toThrow("original");
      await expect(repo.saveProject("missing", 0, input, new Map([[edited.id, edited]]))).rejects.toThrow("original");
    } finally { await repo.close(); }
  });
});
