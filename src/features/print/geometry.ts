export type SizeMm = { widthMm: number; heightMm: number };
export type PointMm = { xMm: number; yMm: number };
export type RectMm = PointMm & SizeMm;
export type PixelSize = { width: number; height: number };
export type CropPx = PixelSize & { x: number; y: number };
export type CropSettings = { zoom: number; horizontal: number; vertical: number };
export type PhotoPlacement = RectMm & { assetId: string; lineId?: string; crop: CropPx; adjustments?: PhotoAdjustments };
export type PrintPage = SizeMm & { photos: PhotoPlacement[]; marks: [PointMm, PointMm][] };
export type PrintDocument = { schemaVersion: 1; pages: PrintPage[]; scale?: number };
export type PhotoLine = PixelSize & {
  assetId: string;
  id?: string;
  photo?: SizeMm;
  copies: number;
  cropSettings: CropSettings;
  adjustments?: PhotoAdjustments;
};
export type PrintSettings = {
  paper: SizeMm;
  photo: SizeMm;
  margin: number;
  gap: number;
  cutMarks: boolean;
  fitToOneSheet?: boolean;
};

export const initialCrop: CropSettings = { zoom: 1, horizontal: 50, vertical: 50 };
export const mmToPt = (mm: number) => (mm * 72) / 25.4;
export const mmToIn = (mm: number) => mm / 25.4;
export const maxCopiesPerPhoto = 1000;
export const maxPages = 100;
export const maxLineItems = 100;

export function sourceCrop(source: PixelSize, frame: SizeMm, settings: CropSettings): CropPx {
  const aspect = frame.widthMm / frame.heightMm;
  const width = Math.min(source.width, source.height * aspect) / settings.zoom;
  const height = width / aspect;
  return {
    x: Math.max(0, source.width - width) * settings.horizontal / 100,
    y: Math.max(0, source.height - height) * settings.vertical / 100,
    width,
    height,
  };
}

export function effectiveDpi(crop: CropPx, frame: SizeMm) {
  return Math.min(crop.width / mmToIn(frame.widthMm), crop.height / mmToIn(frame.heightMm));
}

export function gridFor({ paper, photo, margin, gap }: PrintSettings) {
  const fit = (sheet: number, item: number) => {
    const roomAfterFirst = sheet - 2 * margin - item + 1e-8;
    return roomAfterFirst < 0 ? 0 : 1 + Math.floor(roomAfterFirst / (item + gap));
  };
  const columns = fit(paper.widthMm, photo.widthMm);
  const rows = fit(paper.heightMm, photo.heightMm);
  return { columns, rows, capacity: columns * rows };
}

function cutMarksFor(photo: RectMm, { paper, gap }: PrintSettings): PrintPage["marks"] {
  const marks: PrintPage["marks"] = [];
  for (const [xMm, dx] of [[photo.xMm, -1], [photo.xMm + photo.widthMm, 1]]) {
    for (const [yMm, dy] of [[photo.yMm, -1], [photo.yMm + photo.heightMm, 1]]) {
      const xClearance = dx < 0 ? xMm : paper.widthMm - xMm;
      const yClearance = dy < 0 ? yMm : paper.heightMm - yMm;
      const horizontal = Math.min(2, gap / 2, xClearance - 0.1);
      const vertical = Math.min(2, gap / 2, yClearance - 0.1);
      const corner = { xMm, yMm };
      if (horizontal > 0) marks.push([corner, { xMm: xMm + dx * horizontal, yMm }]);
      if (vertical > 0) marks.push([corner, { xMm, yMm: yMm + dy * vertical }]);
    }
  }
  return marks;
}

export function buildPrintDocument(settings: PrintSettings, lines: PhotoLine[]): PrintDocument {
  const { paper, photo, margin, gap } = settings;
  const dimensions = [paper.widthMm, paper.heightMm, photo.widthMm, photo.heightMm,
    ...lines.flatMap((line) => [line.photo?.widthMm ?? photo.widthMm, line.photo?.heightMm ?? photo.heightMm])];
  if (dimensions.some((value) => !Number.isFinite(value) || value <= 0) ||
      [margin, gap].some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Enter valid paper, photo, margin and spacing measurements.");
  }
  if (lines.some(({ copies }) => !Number.isSafeInteger(copies) || copies < 1 || copies > maxCopiesPerPhoto)) {
    throw new Error(`Enter 1 to ${maxCopiesPerPhoto} copies per photo.`);
  }
  if (lines.length > maxLineItems) throw new Error(`A job can hold up to ${maxLineItems} print entries.`);
  lines.forEach((line) => validateAdjustments(line.adjustments));
  if (settings.fitToOneSheet && lines.length) return fitPrintsToOneSheet(settings, lines);

  const frames = lines.length ? lines.map((line) => line.photo ?? photo) : [photo];
  if (frames.some((frame) => !gridFor({ ...settings, photo: frame }).capacity)) {
    throw new Error("A photo size won’t fit. Choose larger paper, change the photo orientation, or reduce the margins.");
  }
  const first = frames[0];
  const uniform = frames.every((frame) => frame.widthMm === first.widthMm && frame.heightMm === first.heightMm);
  if (!uniform) {
    const document = packMixedPhotos(settings, lines);
    if (!document) throw new Error(`This job exceeds ${maxPages} sheets. Split it into smaller jobs.`);
    return document;
  }
  return packUniformPhotos(settings, lines, first);
}

function packUniformPhotos(settings: PrintSettings, lines: PhotoLine[], cell: SizeMm): PrintDocument {
  const { paper, margin, gap, cutMarks } = settings;
  const { columns, capacity } = gridFor({ ...settings, photo: cell });
  const count = lines.reduce((total, line) => total + line.copies, 0);
  if (Math.ceil(count / capacity) > maxPages) {
    throw new Error(`This job exceeds ${maxPages} sheets. Split it into smaller jobs.`);
  }

  const pages: PrintPage[] = [];
  let index = 0;
  for (const line of lines) {
    const frame = line.photo ?? settings.photo;
    const crop = sourceCrop(line, frame, line.cropSettings);
    for (let copy = 0; copy < line.copies; copy++, index++) {
      const sheet = Math.floor(index / capacity);
      const slot = index % capacity;
      const page = pages[sheet] ??= { ...paper, photos: [], marks: [] };
      const placement = {
        ...frame,
        xMm: margin + (slot % columns) * (cell.widthMm + gap),
        yMm: margin + Math.floor(slot / columns) * (cell.heightMm + gap),
        assetId: line.assetId,
        lineId: line.id,
        adjustments: line.adjustments,
        crop,
      };
      page.photos.push(placement);
      if (cutMarks) page.marks.push(...cutMarksFor(placement, settings));
    }
  }
  return { schemaVersion: 1, pages };
}

function packMixedPhotos(settings: PrintSettings, lines: PhotoLine[], pageLimit = maxPages): PrintDocument | undefined {
  const { paper, margin, gap, cutMarks } = settings;
  const pages: PrintPage[] = [];
  const spaces: RectMm[][] = [];
  const tolerance = 1e-8;

  for (const line of lines) {
    const frame = line.photo ?? settings.photo;
    const crop = sourceCrop(line, frame, line.cropSettings);
    const reservedWidth = frame.widthMm + gap;
    const reservedHeight = frame.heightMm + gap;
    if (frame.widthMm > paper.widthMm - margin * 2 + tolerance ||
        frame.heightMm > paper.heightMm - margin * 2 + tolerance) return;
    for (let copy = 0; copy < line.copies; copy++) {
      // Reserve a gap with each photo. The outer space includes a trailing gap
      // so an exact fit at the paper's right or bottom margin remains possible.
      let pageIndex = spaces.findIndex((pageSpaces) => pageSpaces.some((space) =>
        space.widthMm + tolerance >= reservedWidth && space.heightMm + tolerance >= reservedHeight));
      if (pageIndex < 0) {
        if (pages.length >= pageLimit) return;
        pageIndex = pages.length;
        pages.push({ ...paper, photos: [], marks: [] });
        spaces.push([{
          xMm: margin, yMm: margin,
          widthMm: paper.widthMm - margin * 2 + gap,
          heightMm: paper.heightMm - margin * 2 + gap,
        }]);
      }
      const pageSpaces = spaces[pageIndex];
      const spaceIndex = pageSpaces.findIndex((space) =>
        space.widthMm + tolerance >= reservedWidth && space.heightMm + tolerance >= reservedHeight);
      const [space] = pageSpaces.splice(spaceIndex, 1);
      const placement: PhotoPlacement = {
        ...frame, xMm: space.xMm, yMm: space.yMm,
        assetId: line.assetId, lineId: line.id, crop, adjustments: line.adjustments,
      };
      pages[pageIndex].photos.push(placement);
      if (cutMarks) pages[pageIndex].marks.push(...cutMarksFor(placement, settings));

      const remainingWidth = space.widthMm - reservedWidth;
      const remainingHeight = space.heightMm - reservedHeight;
      if (remainingWidth > tolerance) pageSpaces.push({
        xMm: space.xMm + reservedWidth, yMm: space.yMm,
        widthMm: remainingWidth, heightMm: reservedHeight,
      });
      if (remainingHeight > tolerance) pageSpaces.push({
        xMm: space.xMm, yMm: space.yMm + reservedHeight,
        widthMm: space.widthMm, heightMm: remainingHeight,
      });
      pageSpaces.sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm);
    }
  }
  return { schemaVersion: 1, pages };
}

function uniformFitScale(settings: PrintSettings, frame: SizeMm, count: number) {
  const availableWidth = settings.paper.widthMm - settings.margin * 2;
  const availableHeight = settings.paper.heightMm - settings.margin * 2;
  let best = 0;
  for (let columns = 1; columns <= count; columns++) {
    const rows = Math.ceil(count / columns);
    const widthPerPhoto = (availableWidth - (columns - 1) * settings.gap) / columns;
    const heightPerPhoto = (availableHeight - (rows - 1) * settings.gap) / rows;
    const scale = Math.min(1, widthPerPhoto / frame.widthMm, heightPerPhoto / frame.heightMm);
    best = Math.max(best, scale);
    if (best === 1) break;
  }
  return best;
}

function fitPrintsToOneSheet(settings: PrintSettings, lines: PhotoLine[]): PrintDocument {
  const availableWidth = settings.paper.widthMm - settings.margin * 2;
  const availableHeight = settings.paper.heightMm - settings.margin * 2;
  if (availableWidth <= 0 || availableHeight <= 0) {
    throw new Error("The margins leave no space for photos. Reduce the margins or choose larger paper.");
  }

  const frames = lines.map((line) => line.photo ?? settings.photo);
  const count = lines.reduce((sum, line) => sum + line.copies, 0);
  const largest = {
    widthMm: Math.max(...frames.map((frame) => frame.widthMm)),
    heightMm: Math.max(...frames.map((frame) => frame.heightMm)),
  };
  const baseScale = uniformFitScale(settings, largest, count);
  if (baseScale <= 0) {
    throw new Error("These copies can’t fit on one sheet with the current gap. Reduce the gap or the number of copies.");
  }
  const scaledLines = (scale: number) => lines.map((line, index) => ({
    ...line,
    photo: { widthMm: frames[index].widthMm * scale, heightMm: frames[index].heightMm * scale },
  }));
  const uniform = frames.every((frame) =>
    frame.widthMm === frames[0].widthMm && frame.heightMm === frames[0].heightMm);
  if (uniform) {
    return { ...packUniformPhotos(settings, scaledLines(baseScale), {
      widthMm: largest.widthMm * baseScale, heightMm: largest.heightMm * baseScale,
    }), scale: baseScale };
  }

  const fullSize = packMixedPhotos(settings, lines, 1);
  if (fullSize) return { ...fullSize, scale: 1 };

  // A grid of the largest frame guarantees a feasible starting layout. Then
  // try larger scales with the existing mixed packer while keeping gaps fixed.
  let low = baseScale;
  let high = 1;
  let best = packUniformPhotos(settings, scaledLines(low), {
    widthMm: largest.widthMm * low, heightMm: largest.heightMm * low,
  });
  for (let step = 0; step < 24; step++) {
    const scale = (low + high) / 2;
    const candidate = packMixedPhotos({ ...settings, cutMarks: false }, scaledLines(scale), 1);
    if (candidate) {
      low = scale;
      best = candidate;
    } else {
      high = scale;
    }
  }
  if (settings.cutMarks) {
    for (const page of best.pages) {
      page.marks = page.photos.flatMap((photo) => cutMarksFor(photo, settings));
    }
  }
  return { ...best, scale: low };
}
import { validateAdjustments, type PhotoAdjustments } from "./photo-adjustments";

