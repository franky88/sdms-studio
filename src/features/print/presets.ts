import type { SizeMm } from "./geometry";

export const photoPresetGroups = [
  { id: "id", label: "ID photos" },
  { id: "photo", label: "Photo prints" },
  { id: "square", label: "Square prints" },
  { id: "large", label: "Large prints" },
  { id: "paper", label: "Full-sheet photos" },
] as const;

type PhotoPreset = SizeMm & {
  id: string;
  label: string;
  note: string;
  group: typeof photoPresetGroups[number]["id"];
};

// R-series dimensions use exact inches converted to mm. Dimensions accompany
// every name because labs use different aliases for some large sizes.
export const photoPresets = [
  { id: "id-1x1", label: "1 × 1 in", note: "ID photo", group: "id", widthMm: 25.4, heightMm: 25.4 },
  { id: "id-2x2", label: "2 × 2 in", note: "ID photo", group: "id", widthMm: 50.8, heightMm: 50.8 },
  { id: "id-15x15", label: "1.5 × 1.5 in", note: "ID photo", group: "id", widthMm: 38.1, heightMm: 38.1 },
  { id: "id-35x45", label: "35 × 45 mm", note: "Generic ID", group: "id", widthMm: 35, heightMm: 45 },
  { id: "id-30x40", label: "30 × 40 mm", note: "ID format", group: "id", widthMm: 30, heightMm: 40 },
  { id: "photo-2x3", label: "2 × 3 in", note: "Mini / cute print", group: "photo", widthMm: 50.8, heightMm: 76.2 },
  { id: "photo-2r", label: "2R / Wallet", note: "2.5 × 3.5 in", group: "photo", widthMm: 63.5, heightMm: 88.9 },
  { id: "photo-3r", label: "3R", note: "3.5 × 5 in", group: "photo", widthMm: 88.9, heightMm: 127 },
  { id: "photo-4r", label: "4R", note: "4 × 6 in", group: "photo", widthMm: 101.6, heightMm: 152.4 },
  { id: "photo-5r", label: "5R", note: "5 × 7 in", group: "photo", widthMm: 127, heightMm: 177.8 },
  { id: "photo-6r", label: "6R", note: "6 × 8 in", group: "photo", widthMm: 152.4, heightMm: 203.2 },
  { id: "photo-8r", label: "8R", note: "8 × 10 in", group: "photo", widthMm: 203.2, heightMm: 254 },
  { id: "photo-8rw", label: "8RW / S8R", note: "8 × 12 in", group: "photo", widthMm: 203.2, heightMm: 304.8 },
  { id: "photo-10r", label: "10R", note: "10 × 12 in", group: "photo", widthMm: 254, heightMm: 304.8 },
  { id: "photo-11r", label: "11R", note: "11 × 14 in", group: "photo", widthMm: 279.4, heightMm: 355.6 },
  { id: "photo-12r", label: "12R", note: "12 × 16 in", group: "photo", widthMm: 304.8, heightMm: 406.4 },
  { id: "photo-12rw", label: "12RW / S12R", note: "12 × 18 in", group: "photo", widthMm: 304.8, heightMm: 457.2 },
  { id: "square-3", label: "3 × 3 in", note: "Square", group: "square", widthMm: 76.2, heightMm: 76.2 },
  { id: "square-4", label: "4 × 4 in", note: "Square", group: "square", widthMm: 101.6, heightMm: 101.6 },
  { id: "square-5", label: "5 × 5 in", note: "Square", group: "square", widthMm: 127, heightMm: 127 },
  { id: "square-6", label: "6 × 6 in", note: "Square", group: "square", widthMm: 152.4, heightMm: 152.4 },
  { id: "square-8", label: "8 × 8 in", note: "Square", group: "square", widthMm: 203.2, heightMm: 203.2 },
  { id: "large-8x11", label: "8 × 11 in", note: "Large photo", group: "large", widthMm: 203.2, heightMm: 279.4 },
  { id: "large-8x13", label: "8 × 13 in", note: "Large photo", group: "large", widthMm: 203.2, heightMm: 330.2 },
  { id: "large-16x20", label: "16 × 20 in", note: "Large photo", group: "large", widthMm: 406.4, heightMm: 508 },
  { id: "large-20x24", label: "20 × 24 in", note: "Large photo", group: "large", widthMm: 508, heightMm: 609.6 },
  { id: "large-20x30", label: "20 × 30 in", note: "Large photo", group: "large", widthMm: 508, heightMm: 762 },
  { id: "large-24x36", label: "24 × 36 in", note: "Large photo", group: "large", widthMm: 609.6, heightMm: 914.4 },
  { id: "photo-a5", label: "A5", note: "148 × 210 mm", group: "paper", widthMm: 148, heightMm: 210 },
  { id: "photo-a4", label: "A4", note: "210 × 297 mm", group: "paper", widthMm: 210, heightMm: 297 },
  { id: "photo-a3", label: "A3", note: "297 × 420 mm", group: "paper", widthMm: 297, heightMm: 420 },
  { id: "photo-13x19", label: "13 × 19 in", note: "A3+ format", group: "paper", widthMm: 330.2, heightMm: 482.6 },
] as const satisfies readonly PhotoPreset[];

export type PhotoPresetId = typeof photoPresets[number]["id"];
export const popularPhotoPresets = photoPresets.filter(({ id }) =>
  ["id-1x1", "id-2x2", "id-35x45", "photo-3r", "photo-4r"].includes(id));

export const paperPresets = [
  { id: "a4", label: "A4", widthMm: 210, heightMm: 297 },
  { id: "letter", label: "Short / US Letter", widthMm: 215.9, heightMm: 279.4 },
  { id: "long", label: "Long · 8.5 × 13 in", widthMm: 215.9, heightMm: 330.2 },
  { id: "legal", label: "US Legal · 8.5 × 14 in", widthMm: 215.9, heightMm: 355.6 },
  { id: "a5", label: "A5", widthMm: 148, heightMm: 210 },
  { id: "4r", label: "4R · 4 × 6 in", widthMm: 101.6, heightMm: 152.4 },
  { id: "5r", label: "5R · 5 × 7 in", widthMm: 127, heightMm: 177.8 },
  { id: "8r", label: "8R · 8 × 10 in", widthMm: 203.2, heightMm: 254 },
  { id: "a3", label: "A3", widthMm: 297, heightMm: 420 },
  { id: "13x19", label: "13 × 19 in / A3+", widthMm: 330.2, heightMm: 482.6 },
  { id: "12x18", label: "12 × 18 in", widthMm: 304.8, heightMm: 457.2 },
  { id: "16x20", label: "16 × 20 in", widthMm: 406.4, heightMm: 508 },
  { id: "20x24", label: "20 × 24 in", widthMm: 508, heightMm: 609.6 },
  { id: "20x30", label: "20 × 30 in", widthMm: 508, heightMm: 762 },
  { id: "24x36", label: "24 × 36 in", widthMm: 609.6, heightMm: 914.4 },
] as const;
