import { initialCrop, maxCopiesPerPhoto, maxLineItems } from "../print/geometry";
import { photoPresets, type PhotoPresetId } from "../print/presets";
import type { StudioJob } from "./job";

export type IdPackage = {
  id: string;
  name: string;
  items: { presetId: PhotoPresetId; copies: number }[];
};

export const builtinIdPackages: IdPackage[] = [
  { id: "mixed-id", name: "Mixed ID set", items: [{ presetId: "id-2x2", copies: 4 }, { presetId: "id-1x1", copies: 8 }] },
  { id: "six-2x2", name: "Six 2×2", items: [{ presetId: "id-2x2", copies: 6 }] },
  { id: "fifteen-1x1", name: "Fifteen 1×1", items: [{ presetId: "id-1x1", copies: 15 }] },
];

export function validateIdPackage(input: unknown): IdPackage {
  if (!input || typeof input !== "object") throw new Error("This saved package has invalid data.");
  const value = input as IdPackage;
  if (typeof value.id !== "string" || !value.id || typeof value.name !== "string" || !value.name.trim() || value.name.length > 60 ||
      !Array.isArray(value.items) || !value.items.length || value.items.length > 5) {
    throw new Error("Give the package a name and at least one ID size.");
  }
  const seen = new Set<string>();
  for (const item of value.items) {
    if (!item || !photoPresets.some((preset) => preset.id === item.presetId && preset.group === "id") ||
        seen.has(item.presetId) || !Number.isSafeInteger(item.copies) || item.copies < 1 || item.copies > maxCopiesPerPhoto) {
      throw new Error("Use ID photo sizes with 1 to 1,000 copies per size.");
    }
    seen.add(item.presetId);
  }
  return { id: value.id, name: value.name.trim(), items: value.items.map(({ presetId, copies }) => ({ presetId, copies })) };
}

export function packageFromPhoto(job: StudioJob, assetId: string, name: string, id: string): IdPackage {
  const entries = job.entries.filter((entry) => entry.assetId === assetId);
  const items = new Map<PhotoPresetId, number>();
  for (const entry of entries) {
    const preset = photoPresets.find((preset) => preset.id === entry.presetId);
    if (!preset || preset.group !== "id" || preset.widthMm !== entry.photo.widthMm || preset.heightMm !== entry.photo.heightMm) {
      throw new Error("Choose ID photo sizes for this photo before saving a package.");
    }
    items.set(entry.presetId, (items.get(entry.presetId) ?? 0) + entry.copies);
  }
  return validateIdPackage({ id, name: name.trim(), items: [...items].map(([presetId, copies]) => ({ presetId, copies })) });
}

export function applyIdPackage(job: StudioJob, assetId: string, definition: IdPackage, createId: () => string): StudioJob {
  validateIdPackage(definition);
  const firstIndex = job.entries.findIndex((entry) => entry.assetId === assetId);
  const base = job.entries[firstIndex];
  if (!base) throw new Error("Add and select a photo first.");
  const remaining = job.entries.filter((entry) => entry.assetId !== assetId);
  if (remaining.length + definition.items.length > maxLineItems) throw new Error("This job has too many print entries.");
  const entries = definition.items.map((item) => {
    const preset = photoPresets.find((preset) => preset.id === item.presetId)!;
    const matching = job.entries.find((entry) => entry.assetId === assetId && entry.presetId === item.presetId &&
      entry.photo.widthMm === preset.widthMm && entry.photo.heightMm === preset.heightMm);
    return {
      ...base, ...matching, id: matching?.id ?? createId(), copies: item.copies, presetId: item.presetId,
      photo: { widthMm: preset.widthMm, heightMm: preset.heightMm }, cropSettings: matching?.cropSettings ?? initialCrop,
    };
  });
  return {
    ...job, fitToOneSheet: false,
    entries: [...remaining.slice(0, firstIndex), ...entries, ...remaining.slice(firstIndex)],
  };
}
