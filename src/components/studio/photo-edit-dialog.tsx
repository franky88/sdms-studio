"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { CropPx, PixelSize } from "@/features/print/geometry";
import { initialAdjustments, type PhotoAdjustments } from "@/features/print/photo-adjustments";
import { PhotoPreview } from "./photo-preview";

export function PhotoEditDialog({ name, url, source, crop, adjustments, onSave, onClose }: {
  name: string;
  url: string;
  source: PixelSize;
  crop: CropPx;
  adjustments?: PhotoAdjustments;
  onSave: (adjustments: PhotoAdjustments) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(adjustments ?? initialAdjustments);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} className="crop-dialog photo-edit-dialog" aria-labelledby="photo-edit-title" onCancel={onClose}>
      <div className="dialog-header">
        <div>
          <h2 id="photo-edit-title"><SlidersHorizontal size={19} aria-hidden /> Edit photo</h2>
          <p>{name}</p>
        </div>
        <button type="button" className="icon-button" aria-label="Close photo editor" onClick={onClose}><X size={19} /></button>
      </div>
      <div className="crop-stage">
        <div className="crop-window" style={{
          aspectRatio: `${crop.width} / ${crop.height}`,
          width: `min(100%, ${250 * crop.width / crop.height}px)`,
        }}>
          <PhotoPreview url={url} source={source} crop={crop} adjustments={showOriginal ? initialAdjustments : draft} />
        </div>
      </div>
      <div className="crop-controls edit-controls">
        <label className="compare-toggle">
          <input type="checkbox" checked={showOriginal} onChange={(event) => setShowOriginal(event.target.checked)} />
          Show original
        </label>
        {([
          { key: "brightness", label: "Brightness" },
          { key: "contrast", label: "Contrast" },
        ] as const).map(({ key, label }) => (
          <label className="range-label" key={key}>
            <span>{label} <span>{draft[key] > 0 ? "+" : ""}{draft[key]}</span></span>
            <input type="range" min={-100} max={100} step={1} value={draft[key]} aria-label={label}
              onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} />
          </label>
        ))}
        <p className="edit-note">Applies to all copies listed with this photo.</p>
      </div>
      <div className="dialog-actions edit-actions">
        <button type="button" className="text-button reset-adjustments" onClick={() => {
          setDraft(initialAdjustments);
          setShowOriginal(false);
        }}><RotateCcw size={14} aria-hidden /> Reset</button>
        <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="button primary" onClick={() => onSave(draft)}>Apply edits</button>
      </div>
    </dialog>
  );
}
