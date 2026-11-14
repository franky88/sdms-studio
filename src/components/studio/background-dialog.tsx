"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Paintbrush, Pipette, RotateCcw, X } from "lucide-react";
import { backdropMask, canvasBlob } from "@/features/studio/background";
import type { StudioAsset } from "@/features/studio/job";
import { photoFilter, type PhotoAdjustments } from "@/features/print/photo-adjustments";

export function BackgroundDialog({ source, original, name, adjustments, onSave, onClose }: {
  source: StudioAsset; original: StudioAsset; name: string; adjustments?: PhotoAdjustments; onSave: (asset: StudioAsset) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const data = useRef<{ bitmap: ImageBitmap; mask: HTMLCanvasElement; sample: ImageData } | undefined>(undefined);
  const stroke = useRef<{ x: number; y: number } | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [tool, setTool] = useState<"pick" | "erase" | "restore">("pick");
  const [brush, setBrush] = useState(35);
  const [tolerance, setTolerance] = useState(35);
  const [color, setColor] = useState(source.backgroundColor ?? "transparent");
  const colorRef = useRef(color);

  function paint() {
    const state = data.current, canvas = preview.current;
    if (!state || !canvas) return;
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "source-over";
    context.drawImage(state.bitmap, 0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(state.mask, 0, 0, canvas.width, canvas.height);
    if (colorRef.current !== "transparent") {
      context.globalCompositeOperation = "destination-over"; context.fillStyle = colorRef.current;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.globalCompositeOperation = "source-over";
  }

  useEffect(() => {
    const element = dialog.current; element?.showModal();
    let cancelled = false;
    void (async () => {
      let bitmap: ImageBitmap | undefined;
      try {
        bitmap = await createImageBitmap(original.blob);
        const mask = document.createElement("canvas"); mask.width = original.width; mask.height = original.height;
        const maskContext = mask.getContext("2d")!;
        maskContext.fillStyle = "white"; maskContext.fillRect(0, 0, mask.width, mask.height);
        if (source.backgroundMask) {
          const previous = await createImageBitmap(source.backgroundMask);
          maskContext.clearRect(0, 0, mask.width, mask.height); maskContext.drawImage(previous, 0, 0, mask.width, mask.height); previous.close();
        }
        if (cancelled) { bitmap.close(); return; }
        const scale = Math.min(1, 1000 / Math.max(original.width, original.height));
        const canvas = preview.current!; canvas.width = Math.round(original.width * scale); canvas.height = Math.round(original.height * scale);
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        data.current = { bitmap, mask, sample: context.getImageData(0, 0, canvas.width, canvas.height) };
        paint(); setReady(true);
      } catch (error) { bitmap?.close(); if (!cancelled) setError(error instanceof Error ? error.message : "Couldn’t open this photo."); }
    })();
    return () => { cancelled = true; data.current?.bitmap.close(); data.current = undefined; element?.close(); };
  // This dialog is remounted for each photo; its draft owns the bitmap and mask.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function removeBackdrop(x: number, y: number) {
    const state = data.current; if (!state) return;
    const { sample, mask } = state;
    const keep = backdropMask(sample.data, sample.width, sample.height, x, y, tolerance);
    const small = document.createElement("canvas"); small.width = sample.width; small.height = sample.height;
    const context = small.getContext("2d")!;
    const image = context.createImageData(small.width, small.height);
    keep.forEach((alpha, index) => { image.data[index * 4] = image.data[index * 4 + 1] = image.data[index * 4 + 2] = 255; image.data[index * 4 + 3] = alpha; });
    context.putImageData(image, 0, 0);
    const maskContext = mask.getContext("2d")!;
    maskContext.globalCompositeOperation = "destination-in"; maskContext.drawImage(small, 0, 0, mask.width, mask.height); maskContext.globalCompositeOperation = "source-over";
    paint();
  }

  function brushAt(x: number, y: number) {
    const state = data.current; if (!state) return;
    const context = state.mask.getContext("2d")!;
    context.globalCompositeOperation = tool === "erase" ? "destination-out" : "source-over";
    context.strokeStyle = "white"; context.fillStyle = "white"; context.lineCap = "round"; context.lineJoin = "round";
    context.lineWidth = brush * original.width / preview.current!.width;
    const previous = stroke.current ?? { x, y };
    context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(x, y); context.stroke();
    context.beginPath(); context.arc(x, y, context.lineWidth / 2, 0, Math.PI * 2); context.fill();
    stroke.current = { x, y }; paint();
  }

  async function save() {
    if (!data.current || saving) return;
    setSaving(true); setError(undefined);
    const output = document.createElement("canvas"); output.width = original.width; output.height = original.height;
    try {
      const context = output.getContext("2d")!;
      context.drawImage(data.current.bitmap, 0, 0); context.globalCompositeOperation = "destination-in"; context.drawImage(data.current.mask, 0, 0);
      if (color !== "transparent") { context.globalCompositeOperation = "destination-over"; context.fillStyle = color; context.fillRect(0, 0, output.width, output.height); }
      const blob = await canvasBlob(output);
      const backgroundMask = await canvasBlob(data.current.mask);
      const thumb = document.createElement("canvas"); const scale = Math.min(1, 720 / Math.max(output.width, output.height));
      thumb.width = Math.round(output.width * scale); thumb.height = Math.round(output.height * scale); thumb.getContext("2d")!.drawImage(output, 0, 0, thumb.width, thumb.height);
      const thumbnail = await canvasBlob(thumb);
      onSave({ id: crypto.randomUUID(), originalId: original.id, width: original.width, height: original.height, mime: "image/png", blob, thumbnail, backgroundMask, backgroundColor: color });
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn’t apply this background."); setSaving(false); }
    finally { output.width = 0; output.height = 0; }
  }

  return <dialog ref={dialog} className="crop-dialog background-dialog" aria-labelledby="background-title" onCancel={(event) => { if (saving) event.preventDefault(); else onClose(); }}>
    <div className="dialog-header"><div><h2 id="background-title"><Eraser size={19} /> Background cleanup</h2><p>{name}</p></div><button type="button" className="icon-button" aria-label="Close background editor" disabled={saving} onClick={onClose}><X size={18} /></button></div>
    <div className="background-body">
      <div className="background-stage"><canvas ref={preview} aria-label="Background editing canvas" style={{ filter: photoFilter(adjustments) }} className={tool === "pick" ? "is-picking" : "is-brushing"}
        onPointerDown={(event) => {
          if (!ready || saving || event.button !== 0) return;
          const box = event.currentTarget.getBoundingClientRect();
          const nx = (event.clientX - box.left) / box.width, ny = (event.clientY - box.top) / box.height;
          event.currentTarget.setPointerCapture(event.pointerId);
          if (tool === "pick") removeBackdrop(nx * event.currentTarget.width, ny * event.currentTarget.height);
          else brushAt(nx * original.width, ny * original.height);
        }}
        onPointerMove={(event) => {
          if (!stroke.current || saving) return;
          const box = event.currentTarget.getBoundingClientRect(); brushAt((event.clientX - box.left) * original.width / box.width, (event.clientY - box.top) * original.height / box.height);
        }} onPointerUp={() => { stroke.current = undefined; }} onPointerCancel={() => { stroke.current = undefined; }} /></div>
      <fieldset className="background-controls" disabled={!ready || saving}>
        <legend className="sr-only">Background tools</legend>
        <p className="edit-note">Best for plain backgrounds. Click the backdrop to remove its connected color, then erase or restore edges.</p>
        <div className="background-tools">{([{ id: "pick", label: "Pick backdrop", Icon: Pipette }, { id: "erase", label: "Erase", Icon: Eraser }, { id: "restore", label: "Restore", Icon: Paintbrush }] as const).map(({ id, label, Icon }) => <button key={id} type="button" className={`button ${tool === id ? "primary" : "secondary"}`} aria-pressed={tool === id} onClick={() => setTool(id)}><Icon size={14} /> {label}</button>)}</div>
        <label className="range-label"><span>Color tolerance <span>{tolerance}</span></span><input type="range" min={0} max={150} value={tolerance} aria-label="Background color tolerance" onChange={(event) => setTolerance(Number(event.target.value))} /></label>
        <label className="range-label"><span>Brush size <span>{brush}</span></span><input type="range" min={2} max={150} value={brush} aria-label="Background brush size" onChange={(event) => setBrush(Number(event.target.value))} /></label>
        <button type="button" className="button secondary" onClick={() => removeBackdrop(0, 0)}>Remove corner backdrop</button>
        <label className="field"><span>Replace background</span><select value={color === "transparent" || ["#ffffff", "#1677d2", "#d92c3a"].includes(color) ? color : "custom"} onChange={(event) => { const value = event.target.value === "custom" ? "#e6e6e6" : event.target.value; setColor(value); colorRef.current = value; paint(); }}>
          <option value="transparent">Transparent</option><option value="#ffffff">White</option><option value="#1677d2">Blue</option><option value="#d92c3a">Red</option><option value="custom">Custom color</option>
        </select></label>
        {color !== "transparent" && <label className="field"><span>Background color</span><input type="color" value={color} onChange={(event) => { setColor(event.target.value); colorRef.current = event.target.value; paint(); }} /></label>}
        <button type="button" className="text-button" onClick={() => { const mask = data.current!.mask; const context = mask.getContext("2d")!; context.globalCompositeOperation = "source-over"; context.fillStyle = "white"; context.fillRect(0, 0, mask.width, mask.height); paint(); }}><RotateCcw size={14} /> Restore all edges</button>
        <p className="edit-note">The original photo stays available. Apply saves this entry’s background at its original pixel dimensions.</p>
      </fieldset>
    </div>
    {!ready && !error && <p className="notice" role="status">Opening original photo…</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" className="button secondary" disabled={saving} onClick={onClose}>Cancel</button><button type="button" className="button primary" disabled={!ready || saving} onClick={() => { void save(); }}>{saving ? "Applying background…" : "Apply background"}</button></div>
  </dialog>;
}
