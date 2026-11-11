import { clip, endPath, PDFDocument, type PDFImage, popGraphicsState, pushGraphicsState, rectangle, rgb } from "pdf-lib";
import { mmToPt, type PixelSize, type PrintDocument } from "./geometry";
import { validateAdjustments } from "./photo-adjustments";
import { renderAdjustedPhoto } from "./render-adjusted-photo";

export type PrintAsset = PixelSize & { blob: Blob; mime: "image/jpeg" | "image/png" };

export async function exportPdf(document: PrintDocument, assets: ReadonlyMap<string, PrintAsset>) {
  if (!document.pages.length) throw new Error("Add at least one photo before exporting.");

  const pdf = await PDFDocument.create();
  pdf.setTitle("SDMS Print Studio – Quick Print");
  const embedded = new Map<string, PDFImage>();

  for (const sheet of document.pages) {
    const page = pdf.addPage([mmToPt(sheet.widthMm), mmToPt(sheet.heightMm)]);
    for (const photo of sheet.photos) {
      const asset = assets.get(photo.assetId);
      if (!asset) throw new Error("A source photo is missing. Add it again and retry.");
      const adjustments = validateAdjustments(photo.adjustments);
      const cacheKey = JSON.stringify([photo.assetId, adjustments.brightness, adjustments.contrast]);
      let image = embedded.get(cacheKey);
      if (!image) {
        const adjusted = adjustments.brightness !== 0 || adjustments.contrast !== 0;
        const blob = await renderAdjustedPhoto(asset.blob, adjustments);
        const bytes = await blob.arrayBuffer();
        image = !adjusted && asset.mime === "image/jpeg" ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
        if (image.width !== asset.width || image.height !== asset.height) {
          throw new Error("A source photo has inconsistent dimensions. Add it again and retry.");
        }
        embedded.set(cacheKey, image);
      }

      const x = mmToPt(photo.xMm);
      const y = mmToPt(sheet.heightMm - photo.yMm - photo.heightMm);
      const width = mmToPt(photo.widthMm);
      const height = mmToPt(photo.heightMm);
      const scaleX = width / photo.crop.width;
      const scaleY = height / photo.crop.height;
      page.pushOperators(pushGraphicsState(), rectangle(x, y, width, height), clip(), endPath());
      page.drawImage(image, {
        x: x - photo.crop.x * scaleX,
        y: y + height - (asset.height - photo.crop.y) * scaleY,
        width: asset.width * scaleX,
        height: asset.height * scaleY,
      });
      page.pushOperators(popGraphicsState());
    }

    for (const [start, end] of sheet.marks) {
      page.drawLine({
        start: { x: mmToPt(start.xMm), y: mmToPt(sheet.heightMm - start.yMm) },
        end: { x: mmToPt(end.xMm), y: mmToPt(sheet.heightMm - end.yMm) },
        thickness: 0.3,
        color: rgb(0.18, 0.18, 0.18),
      });
    }
  }

  return pdf.save();
}
