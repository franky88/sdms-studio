import { ChevronLeft, ChevronRight, Download, FileImage, Info, Layers3, LoaderCircle, ScanLine } from "lucide-react";
import { type PixelSize, type PrintPage, type RectMm, type SizeMm } from "@/features/print/geometry";
import { PhotoPreview } from "./photo-preview";

function frameStyle(frame: RectMm, paper: SizeMm) {
  return {
    left: `${100 * frame.xMm / paper.widthMm}%`,
    top: `${100 * frame.yMm / paper.heightMm}%`,
    width: `${100 * frame.widthMm / paper.widthMm}%`,
    height: `${100 * frame.heightMm / paper.heightMm}%`,
  };
}

export function SheetPreview({
  paper, paperLabel, sheet, placeholders, previews, pageIndex, pages, total, capacity, sizeCount, printScaleLabel, exporting, onPageChange, onExport,
}: {
  paper: SizeMm;
  paperLabel: string;
  sheet: PrintPage | undefined;
  placeholders: RectMm[];
  previews: ReadonlyMap<string, PixelSize & { url: string }>;
  pageIndex: number;
  pages: number;
  total: number;
  capacity: number | null;
  sizeCount: number;
  printScaleLabel?: string;
  exporting: boolean;
  onPageChange: (index: number) => void;
  onExport: () => void;
}) {
  return (
    <section className="panel preview-panel" aria-labelledby="preview-heading">
      <div className="preview-header">
        <div className="preview-heading">
          <div className="section-icon" aria-hidden><Layers3 size={19} /></div>
          <div>
            <h2 id="preview-heading">Sheet preview</h2>
            <p>{paperLabel} · {paper.widthMm} × {paper.heightMm} mm</p>
          </div>
        </div>
        <div className="page-controls" aria-label="Preview sheets">
          <button className="icon-button" type="button" aria-label="Previous sheet" disabled={pageIndex === 0} onClick={() => onPageChange(pageIndex - 1)}>
            <ChevronLeft size={17} />
          </button>
          <span aria-live="polite">{pages ? pageIndex + 1 : 0} / {pages}</span>
          <button className="icon-button" type="button" aria-label="Next sheet" disabled={pageIndex + 1 >= pages} onClick={() => onPageChange(pageIndex + 1)}>
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="preview-stage">
        <span className="stage-label"><ScanLine size={13} aria-hidden /> PRINT AREA</span>
        <div className="paper" style={{
          aspectRatio: `${paper.widthMm} / ${paper.heightMm}`,
          width: `min(100%, calc(var(--sheet-height) * ${paper.widthMm / paper.heightMm}))`,
        }} aria-label={sheet ? `Sheet ${pageIndex + 1}, ${sheet.photos.length} prints` : "Empty sheet preview"} role="img">
          {sheet ? sheet.photos.map((photo, index) => {
            const preview = previews.get(photo.assetId);
            return preview && (
              <div className="paper-photo" key={index} style={{ ...frameStyle(photo, paper), transform: `rotate(${photo.rotation ?? 0}deg)` }}>
                <PhotoPreview url={preview.url} source={preview} crop={photo.crop} adjustments={photo.adjustments} />
              </div>
            );
          }) : placeholders.map((frame, index) => (
            <div className="paper-placeholder" key={index} style={frameStyle(frame, paper)} />
          ))}
          {sheet && sheet.marks.length > 0 && (
            <svg className="paper-marks" viewBox={`0 0 ${paper.widthMm} ${paper.heightMm}`} aria-hidden>
              {sheet.marks.map(([start, end], index) => (
                <line key={index} x1={start.xMm} y1={start.yMm} x2={end.xMm} y2={end.yMm} stroke="#282828" strokeWidth={0.15} />
              ))}
            </svg>
          )}
        </div>
        {!sheet && (
          <div className="preview-empty">
            <FileImage size={16} aria-hidden /> Add photos to see your layout
          </div>
        )}
      </div>
      <div className="preview-summary">
        <div><span>Prints</span><strong>{total}</strong></div>
        <div>
          <span>{printScaleLabel ? "Print scale" : capacity === null ? "Sizes" : "Per sheet"}</span>
          <strong>{printScaleLabel ?? (capacity === null ? sizeCount : capacity || "—")}</strong>
        </div>
        <div><span>Sheets</span><strong>{pages}</strong></div>
      </div>
      <div className="preview-actions">
        <button className="button primary download-button" type="button" disabled={!pages || exporting} onClick={onExport}>
          {exporting ? <LoaderCircle className="spin" size={18} aria-hidden /> : <Download size={18} aria-hidden />}
          {exporting ? "Preparing PDF…" : "Download PDF"}
        </button>
        <p><Info size={14} aria-hidden /> In your print dialog, choose <strong>Actual size / 100%</strong>.</p>
      </div>
    </section>
  );
}
