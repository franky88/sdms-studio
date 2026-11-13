import type { PrintAsset } from "../print/export-pdf";
import { maxLineItems, type PhotoLine, type SizeMm } from "../print/geometry";
import { validateAdjustments } from "../print/photo-adjustments";
import { paperPresets, photoPresets, type PaperPresetId, type PhotoPresetId } from "../print/presets";

export type PhotoEntry = PhotoLine & {
  id: string;
  name: string;
  presetId: PhotoPresetId;
  photo: SizeMm;
};

export type StudioAsset = PrintAsset & { id: string; thumbnail: Blob };
export type AssetPreview = StudioAsset & { url: string };
export type StudioJob = {
  schemaVersion: 1;
  title: string;
  presetId: PhotoPresetId;
  paperId: PaperPresetId;
  landscape: boolean;
  margin: string;
  gap: string;
  cutMarks: boolean;
  fitToOneSheet: boolean;
  entries: PhotoEntry[];
};

export function createStudioJob(): StudioJob {
  return {
    schemaVersion: 1, title: "Untitled print job", presetId: "id-2x2", paperId: "a4",
    landscape: false, margin: "5", gap: "3", cutMarks: false, fitToOneSheet: false, entries: [],
  };
}

function record(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("This saved project has invalid data.");
}

function text(value: unknown, maximum: number): asserts value is string {
  if (typeof value !== "string" || value.length > maximum) throw new Error("This saved project has invalid text.");
}

function finite(value: unknown, minimum: number, maximum: number): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error("This saved project has invalid measurements.");
  }
}

export function validateStudioJob(value: unknown): StudioJob {
  record(value);
  if (value.schemaVersion !== 1) throw new Error("This project uses an unsupported version.");
  text(value.title, 80);
  text(value.margin, 100);
  text(value.gap, 100);
  if (!photoPresets.some((preset) => preset.id === value.presetId) ||
      !paperPresets.some((preset) => preset.id === value.paperId) ||
      typeof value.landscape !== "boolean" ||
      typeof value.cutMarks !== "boolean" || typeof value.fitToOneSheet !== "boolean" ||
      !Array.isArray(value.entries) || value.entries.length > maxLineItems) {
    throw new Error("This saved project has invalid settings.");
  }
  const ids = new Set<string>();
  const entries: PhotoEntry[] = value.entries.map((entry: unknown) => {
    record(entry);
    text(entry.id, 100);
    text(entry.assetId, 100);
    text(entry.name, 260);
    if (!entry.id || !entry.assetId || ids.has(entry.id) ||
        !photoPresets.some((preset) => preset.id === entry.presetId) ||
        typeof entry.copies !== "number" || (!Number.isFinite(entry.copies) && !Number.isNaN(entry.copies))) {
      throw new Error("This saved project has an invalid photo entry.");
    }
    ids.add(entry.id);
    finite(entry.width, 1, 12_000);
    finite(entry.height, 1, 12_000);
    record(entry.photo);
    finite(entry.photo.widthMm, Number.MIN_VALUE, 10_000);
    finite(entry.photo.heightMm, Number.MIN_VALUE, 10_000);
    record(entry.cropSettings);
    finite(entry.cropSettings.zoom, 1, 4);
    finite(entry.cropSettings.horizontal, 0, 100);
    finite(entry.cropSettings.vertical, 0, 100);
    let adjustments;
    if (entry.adjustments !== undefined) {
      record(entry.adjustments);
      finite(entry.adjustments.brightness, -100, 100);
      finite(entry.adjustments.contrast, -100, 100);
      adjustments = validateAdjustments({
        brightness: entry.adjustments.brightness, contrast: entry.adjustments.contrast,
      });
    }
    return {
      id: entry.id, assetId: entry.assetId, name: entry.name, presetId: entry.presetId as PhotoPresetId,
      width: entry.width, height: entry.height, copies: entry.copies,
      photo: { widthMm: entry.photo.widthMm, heightMm: entry.photo.heightMm },
      cropSettings: {
        zoom: entry.cropSettings.zoom, horizontal: entry.cropSettings.horizontal, vertical: entry.cropSettings.vertical,
      },
      adjustments,
    };
  });
  return {
    schemaVersion: 1, title: value.title, presetId: value.presetId as PhotoPresetId, paperId: value.paperId as PaperPresetId,
    landscape: value.landscape, margin: value.margin, gap: value.gap,
    cutMarks: value.cutMarks, fitToOneSheet: value.fitToOneSheet, entries,
  };
}
