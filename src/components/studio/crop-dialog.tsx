"use client";

import { useEffect, useRef, useState } from "react";
import { Crop, RotateCcw, X } from "lucide-react";
import { effectiveDpi, initialCrop, sourceCrop, type CropSettings, type PixelSize, type SizeMm } from "@/features/print/geometry";
import { PhotoPreview } from "./photo-preview";
import type { PhotoAdjustments } from "@/features/print/photo-adjustments";

export function CropDialog({ name, url, source, frame, settings, adjustments, onSave, onClose }: {
  name: string;
  url: string;
  source: PixelSize;
  frame: SizeMm;
  settings: CropSettings;
  adjustments?: PhotoAdjustments;
  onSave: (settings: CropSettings) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(settings);
  const crop = sourceCrop(source, frame, draft);
  const dpi = Math.round(effectiveDpi(crop, frame));
  const fields = [
    { key: "zoom", label: "Zoom", min: 1, max: 4, step: 0.01, value: `${Math.round(draft.zoom * 100)}%` },
    { key: "horizontal", label: "Horizontal position", min: 0, max: 100, step: 1, value: `${draft.horizontal}%`, disabled: source.width - crop.width < 0.01 },
    { key: "vertical", label: "Vertical position", min: 0, max: 100, step: 1, value: `${draft.vertical}%`, disabled: source.height - crop.height < 0.01 },
  ] as const;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} className="crop-dialog" aria-labelledby="crop-title" onCancel={onClose}>
      <div className="dialog-header">
        <div>
          <h2 id="crop-title"><Crop size={19} aria-hidden /> Crop photo</h2>
          <p>{name}</p>
        </div>
        <button type="button" className="icon-button" aria-label="Close crop" onClick={onClose}><X size={19} /></button>
      </div>
      <div className="crop-stage">
        <div className="crop-window" style={{
          aspectRatio: `${frame.widthMm} / ${frame.heightMm}`,
          width: `min(100%, ${250 * frame.widthMm / frame.heightMm}px)`,
        }}>
          <PhotoPreview url={url} source={source} crop={crop} adjustments={adjustments} />
          <div className="crop-guides" aria-hidden />
        </div>
      </div>
      <div className="crop-controls">
        {fields.map((field) => (
          <label key={field.key} className="range-label">
            <span>{field.label} <span>{field.value}</span></span>
            <input
              type="range" min={field.min} max={field.max} step={field.step} value={draft[field.key]}
              disabled={"disabled" in field && field.disabled}
              onChange={(event) => setDraft({ ...draft, [field.key]: Number(event.target.value) })}
            />
          </label>
        ))}
        <div className="crop-meta">
          <span className={dpi < 300 ? "dpi-warning" : ""}>{dpi} DPI at print size</span>
          <button className="text-button" type="button" onClick={() => setDraft(initialCrop)}><RotateCcw size={14} /> Reset crop</button>
        </div>
      </div>
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="button primary" onClick={() => onSave(draft)}>Apply crop</button>
      </div>
    </dialog>
  );
}
