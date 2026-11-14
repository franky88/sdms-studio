import { cutMarksFor, maxPages, sourceCrop, type PhotoPlacement, type PrintDocument, type PrintSettings, type SizeMm } from "../print/geometry";
import type { StudioJob } from "./job";

export type ManualItem = { id: string; lineId: string; xMm: number; yMm: number; rotation: number };
export type ManualLayout = { scale: number; pages: ManualItem[][] };

export function layoutFromDocument(document: PrintDocument): ManualLayout {
  let index = 0;
  return { scale: document.scale ?? 1, pages: document.pages.map((page) => page.photos.map((photo) => {
    if (!photo.lineId) throw new Error("This photo has no print entry.");
    return { id: `print-${index++}`, lineId: photo.lineId, xMm: photo.xMm, yMm: photo.yMm, rotation: photo.rotation ?? 0 };
  })) };
}

export function rotatedBounds(frame: SizeMm, rotation: number) {
  const angle = rotation * Math.PI / 180;
  return {
    widthMm: Math.abs(Math.cos(angle)) * frame.widthMm + Math.abs(Math.sin(angle)) * frame.heightMm,
    heightMm: Math.abs(Math.sin(angle)) * frame.widthMm + Math.abs(Math.cos(angle)) * frame.heightMm,
  };
}

export function constrainItem(item: ManualItem, frame: SizeMm, paper: SizeMm): ManualItem {
  if (![item.xMm, item.yMm, item.rotation].every(Number.isFinite)) throw new Error("Enter valid position and rotation values.");
  const bounds = rotatedBounds(frame, item.rotation);
  if (bounds.widthMm > paper.widthMm + 1e-7 || bounds.heightMm > paper.heightMm + 1e-7) {
    throw new Error("This rotation won’t fit on the paper. Use a smaller angle or larger paper.");
  }
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const x = clamp(item.xMm + frame.widthMm / 2, bounds.widthMm / 2, paper.widthMm - bounds.widthMm / 2) - frame.widthMm / 2;
  const y = clamp(item.yMm + frame.heightMm / 2, bounds.heightMm / 2, paper.heightMm - bounds.heightMm / 2) - frame.heightMm / 2;
  return { ...item, xMm: x, yMm: y, rotation: ((item.rotation + 180) % 360 + 360) % 360 - 180 };
}

export function manualPrintDocument(job: StudioJob, settings: PrintSettings, layout: ManualLayout): PrintDocument {
  if (!Number.isFinite(layout.scale) || layout.scale <= 0 || layout.scale > 1 || !layout.pages.length || layout.pages.length > maxPages) {
    throw new Error("This manual layout has invalid sheets or scale.");
  }
  const ids = new Set<string>();
  const counts = new Map<string, number>();
  const pages = layout.pages.map((items) => {
    const photos: PhotoPlacement[] = items.map((item) => {
      const entry = job.entries.find((entry) => entry.id === item.lineId);
      if (!entry || ids.has(item.id)) throw new Error("This manual layout has an invalid photo reference.");
      ids.add(item.id);
      counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
      const frame = { widthMm: entry.photo.widthMm * layout.scale, heightMm: entry.photo.heightMm * layout.scale };
      const constrained = constrainItem(item, frame, settings.paper);
      if (Math.abs(constrained.xMm - item.xMm) > 1e-6 || Math.abs(constrained.yMm - item.yMm) > 1e-6) {
        throw new Error("A manually positioned photo extends beyond the paper.");
      }
      return { ...frame, ...item, lineId: entry.id, assetId: entry.assetId, crop: sourceCrop(entry, frame, entry.cropSettings), adjustments: entry.adjustments };
    });
    const marks = settings.cutMarks ? photos.flatMap((photo) => {
      const angle = (photo.rotation ?? 0) * Math.PI / 180;
      const cx = photo.xMm + photo.widthMm / 2;
      const cy = photo.yMm + photo.heightMm / 2;
      return cutMarksFor(photo, settings).map((pair) => pair.map((point) => ({
        xMm: cx + (point.xMm - cx) * Math.cos(angle) - (point.yMm - cy) * Math.sin(angle),
        yMm: cy + (point.xMm - cx) * Math.sin(angle) + (point.yMm - cy) * Math.cos(angle),
      })) as typeof pair).filter((pair) => pair.every((point) => point.xMm >= 0 && point.yMm >= 0 && point.xMm <= settings.paper.widthMm && point.yMm <= settings.paper.heightMm));
    }) : [];
    return { ...settings.paper, photos, marks };
  });
  if (job.entries.some((entry) => counts.get(entry.id) !== entry.copies)) throw new Error("The manual layout does not match the photo quantities. Return to auto layout.");
  return { schemaVersion: 1, pages, scale: layout.scale };
}

// Crops, effects and source replacement preserve positions. Structural edits
// return to automatic arrangement in the same undoable transaction.
export function reconcileManualLayout(current: StudioJob, next: StudioJob): StudioJob {
  if (!current.manualLayout || !next.manualLayout) return next;
  const signature = (job: StudioJob) => JSON.stringify([
    job.paperId, job.landscape, job.margin, job.gap, job.fitToOneSheet,
    job.entries.map((entry) => [entry.id, entry.copies, entry.photo.widthMm, entry.photo.heightMm]),
  ]);
  return signature(current) === signature(next) ? next : { ...next, manualLayout: undefined };
}
