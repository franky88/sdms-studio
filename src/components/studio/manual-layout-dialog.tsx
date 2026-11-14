"use client";

import { useEffect, useRef, useState } from "react";
import { AlignCenterHorizontal, AlignCenterVertical, Move, Redo2, RotateCw, Undo2, X } from "lucide-react";
import type { PrintDocument, PrintSettings } from "@/features/print/geometry";
import { constrainItem, layoutFromDocument, manualPrintDocument, rotatedBounds, type ManualItem, type ManualLayout } from "@/features/studio/manual-layout";
import type { AssetPreview, StudioJob } from "@/features/studio/job";
import { PhotoPreview } from "./photo-preview";

export function ManualLayoutDialog({ job, settings, document, assets, onSave, onClose }: {
  job: StudioJob; settings: PrintSettings; document: PrintDocument; assets: ReadonlyMap<string, AssetPreview>;
  onSave: (layout: ManualLayout) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<ManualLayout>(() => job.manualLayout ?? layoutFromDocument(document));
  const draftRef = useRef(draft);
  const [past, setPast] = useState<ManualLayout[]>([]);
  const [future, setFuture] = useState<ManualLayout[]>([]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(draft.pages[0]?.[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const drag = useRef<{ startX: number; startY: number; item: ManualItem; before: ManualLayout; width: number; height: number } | undefined>(undefined);
  const print = manualPrintDocument(job, settings, draft);
  const selectedItem = draft.pages.flat().find((item) => item.id === selected);
  const selectedFrame = print.pages.flatMap((sheet) => sheet.photos).find((item) => item.id === selected);
  const paper = settings.paper;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function replace(next: ManualLayout) { draftRef.current = next; setDraft(next); }
  function commit(next: ManualLayout, before = draftRef.current) {
    setPast((current) => [...current.slice(-49), before]); setFuture([]); replace(next); setError(undefined);
  }
  function update(item: ManualItem) {
    if (!selectedFrame) return;
    try {
      const bounded = constrainItem(item, selectedFrame, paper);
      commit({ ...draft, pages: draft.pages.map((items) => items.map((current) => current.id === item.id ? bounded : current)) });
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn’t position this photo."); }
  }
  function align(axis: "x" | "y", edge: "start" | "center" | "end") {
    if (!selectedItem || !selectedFrame) return;
    const bounds = rotatedBounds(selectedFrame, selectedItem.rotation);
    const sheetSize = axis === "x" ? paper.widthMm : paper.heightMm;
    const boundSize = axis === "x" ? bounds.widthMm : bounds.heightMm;
    const frameSize = axis === "x" ? selectedFrame.widthMm : selectedFrame.heightMm;
    const center = edge === "center" ? sheetSize / 2 : edge === "start" ? settings.margin + boundSize / 2 : sheetSize - settings.margin - boundSize / 2;
    update({ ...selectedItem, [axis === "x" ? "xMm" : "yMm"]: center - frameSize / 2 });
  }
  const undo = () => {
    const previous = past.at(-1); if (!previous) return;
    setFuture([draft, ...future]); setPast(past.slice(0, -1)); replace(previous);
    const restoredPage = previous.pages.findIndex((items) => items.some((item) => item.id === selected));
    setPage(restoredPage < 0 ? Math.min(page, previous.pages.length - 1) : restoredPage);
  };
  const redo = () => {
    if (!future.length) return;
    setPast([...past, draft]); replace(future[0]); setFuture(future.slice(1));
    const restoredPage = future[0].pages.findIndex((items) => items.some((item) => item.id === selected));
    setPage(restoredPage < 0 ? Math.min(page, future[0].pages.length - 1) : restoredPage);
  };

  return <dialog ref={dialog} className="crop-dialog manual-dialog" aria-labelledby="manual-title" onCancel={onClose} onKeyDown={(event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || (event.target instanceof HTMLElement && event.target.closest("input, select, textarea"))) return;
    if (event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
    if (event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
  }}>
    <div className="dialog-header"><div><h2 id="manual-title"><Move size={19} /> Manual layout</h2><p>Drag individual prints. Measurements are in millimeters.</p></div>
      <button type="button" className="icon-button" aria-label="Close layout editor" onClick={onClose}><X size={18} /></button></div>
    <div className="manual-body">
      <div className="manual-stage">
        <div className="manual-paper" aria-label="Editable print sheet" style={{ aspectRatio: `${paper.widthMm}/${paper.heightMm}`, width: `min(100%, ${500 * paper.widthMm / paper.heightMm}px)` }}>
          <div className="manual-safe-area" style={{ inset: `${100 * settings.margin / paper.heightMm}% ${100 * settings.margin / paper.widthMm}%` }} />
          {print.pages[page]?.photos.map((photo, index) => {
            const source = assets.get(photo.assetId); if (!source) return null;
            return <button type="button" key={photo.id} className={`manual-photo${selected === photo.id ? " is-selected" : ""}`}
              aria-label={`Select print ${index + 1}`} aria-pressed={selected === photo.id}
              style={{ left: `${100 * photo.xMm / paper.widthMm}%`, top: `${100 * photo.yMm / paper.heightMm}%`, width: `${100 * photo.widthMm / paper.widthMm}%`, height: `${100 * photo.heightMm / paper.heightMm}%`, transform: `rotate(${photo.rotation}deg)` }}
              onClick={() => setSelected(photo.id!)}
              onKeyDown={(event) => {
                const offsets: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
                if (!offsets[event.key]) return;
                event.preventDefault(); setSelected(photo.id!);
                const item = draft.pages[page].find((item) => item.id === photo.id)!;
                const step = event.shiftKey ? 5 : 1;
                const bounded = constrainItem({ ...item, xMm: item.xMm + offsets[event.key][0] * step, yMm: item.yMm + offsets[event.key][1] * step }, photo, paper);
                commit({ ...draft, pages: draft.pages.map((items) => items.map((item) => item.id === bounded.id ? bounded : item)) });
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                setSelected(photo.id!); event.currentTarget.setPointerCapture(event.pointerId);
                const box = event.currentTarget.parentElement!.getBoundingClientRect();
                drag.current = { startX: event.clientX, startY: event.clientY, item: draft.pages[page].find((item) => item.id === photo.id)!, before: draftRef.current, width: box.width, height: box.height };
              }}
              onPointerMove={(event) => {
                const gesture = drag.current; if (!gesture) return;
                const item = constrainItem({ ...gesture.item, xMm: gesture.item.xMm + (event.clientX - gesture.startX) * paper.widthMm / gesture.width, yMm: gesture.item.yMm + (event.clientY - gesture.startY) * paper.heightMm / gesture.height }, photo, paper);
                replace({ ...gesture.before, pages: gesture.before.pages.map((items) => items.map((current) => current.id === item.id ? item : current)) });
              }}
              onPointerUp={() => { const gesture = drag.current; drag.current = undefined; if (gesture && draftRef.current !== gesture.before) commit(draftRef.current, gesture.before); }}
              onPointerCancel={() => { if (drag.current) replace(drag.current.before); drag.current = undefined; }}>
              <PhotoPreview url={source.url} source={source} crop={photo.crop} adjustments={photo.adjustments} />
            </button>;
          })}
        </div>
      </div>
      <div className="manual-inspector">
        <div className="manual-history"><button type="button" className="icon-button" aria-label="Undo layout edit" disabled={!past.length} onClick={undo}><Undo2 size={17} /></button><button type="button" className="icon-button" aria-label="Redo layout edit" disabled={!future.length} onClick={redo}><Redo2 size={17} /></button></div>
        <label className="field"><span>View sheet</span><select value={page} onChange={(event) => { const next = Number(event.target.value); setPage(next); setSelected(draft.pages[next][0]?.id ?? ""); }}>{draft.pages.map((_, index) => <option key={index} value={index}>Sheet {index + 1}</option>)}</select></label>
        <button type="button" className="text-button" disabled={draft.pages.length >= 100} onClick={() => { commit({ ...draft, pages: [...draft.pages, []] }); setPage(draft.pages.length); setSelected(""); }}>+ Add sheet</button>
        <label className="field"><span>Selected print</span><select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose a print</option>{print.pages[page]?.photos.map((photo, index) => <option key={photo.id} value={photo.id}>Print {index + 1} · {job.entries.find((entry) => entry.id === photo.lineId)?.name}</option>)}</select></label>
        {selectedItem && selectedFrame && <>
          <p className="manual-size">{selectedFrame.widthMm.toFixed(2)} × {selectedFrame.heightMm.toFixed(2)} mm</p>
          <div className="settings-grid">{(["xMm", "yMm", "rotation"] as const).map((key) => <label className="field" key={key}><span>{key === "xMm" ? "X (mm)" : key === "yMm" ? "Y (mm)" : "Rotation (°)"}</span>
            <input type="number" step="0.1" aria-label={key === "xMm" ? "Print X (mm)" : key === "yMm" ? "Print Y (mm)" : "Print rotation (degrees)"} value={Math.round(selectedItem[key] * 100) / 100} onChange={(event) => { if (event.target.value !== "") update({ ...selectedItem, [key]: event.target.valueAsNumber }); }} /></label>)}</div>
          <button type="button" className="button secondary" onClick={() => update({ ...selectedItem, rotation: selectedItem.rotation + 90 })}><RotateCw size={15} /> Rotate 90°</button>
          <div className="align-buttons">{(["start", "center", "end"] as const).map((edge) => <button type="button" className="button secondary" key={`x-${edge}`} onClick={() => align("x", edge)}>{edge === "start" ? "Left" : edge === "end" ? "Right" : <><AlignCenterHorizontal size={14} /> Center</>}</button>)}</div>
          <div className="align-buttons">{(["start", "center", "end"] as const).map((edge) => <button type="button" className="button secondary" key={`y-${edge}`} onClick={() => align("y", edge)}>{edge === "start" ? "Top" : edge === "end" ? "Bottom" : <><AlignCenterVertical size={14} /> Middle</>}</button>)}</div>
          <label className="field"><span>Move print to sheet</span><select value={draft.pages.findIndex((items) => items.some((item) => item.id === selected))} onChange={(event) => {
            const destination = Number(event.target.value);
            commit({ ...draft, pages: draft.pages.map((items, index) => [...items.filter((item) => item.id !== selected), ...(index === destination ? [selectedItem] : [])]) }); setPage(destination);
          }}>{draft.pages.map((_, index) => <option key={index} value={index}>Sheet {index + 1}</option>)}</select></label>
        </>}
        <p className="edit-note">Arrow keys move a selected print by 1 mm; Shift + arrow moves 5 mm. Photos may overlap in manual layout.</p>
        {error && <p className="notice error" role="alert">{error}</p>}
      </div>
    </div>
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="button" className="button primary" onClick={() => onSave(draft)}>Apply layout</button></div>
  </dialog>;
}
