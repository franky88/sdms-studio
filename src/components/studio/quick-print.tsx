"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Crop, FileImage, ImagePlus, LockKeyhole, Plus, RotateCw, Scissors, Shrink, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import {
  buildPrintDocument, effectiveDpi, gridFor, initialCrop, maxCopiesPerPhoto, maxLineItems, sourceCrop,
  type PhotoLine, type PrintSettings, type SizeMm,
} from "@/features/print/geometry";
import { importPhoto, maxFiles, maxJobPixels } from "@/features/print/import-photo";
import { paperPresets, photoPresets, photoPresetGroups, popularPhotoPresets, type PhotoPresetId } from "@/features/print/presets";
import type { PrintAsset } from "@/features/print/export-pdf";
import { CropDialog } from "./crop-dialog";
import { PhotoPreview } from "./photo-preview";
import { PhotoEditDialog } from "./photo-edit-dialog";
import { SheetPreview } from "./sheet-preview";

type Photo = PrintAsset & PhotoLine & { id: string; name: string; url: string; presetId: PhotoPresetId; photo: SizeMm };
type PaperId = typeof paperPresets[number]["id"];

function PhotoSizeOptions() {
  return photoPresetGroups.map((group) => (
    <optgroup key={group.id} label={group.label}>
      {photoPresets.filter((preset) => preset.group === group.id).map((preset) => (
        <option key={preset.id} value={preset.id}>{preset.label} · {preset.note}</option>
      ))}
    </optgroup>
  ));
}

function Step({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <section className="panel step-panel" aria-labelledby={`step-${number}`}>
      <div className="step-heading">
        <span className={`step-number step-${number}`} aria-hidden>{number}</span>
        <h2 id={`step-${number}`}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

const inputNumber = (value: string) => value.trim() ? Number(value) : NaN;
const sizeFormat = new Intl.NumberFormat("en", { maximumSignificantDigits: 4 });
const scaleFormat = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });

export function QuickPrint() {
  const [presetId, setPresetId] = useState<PhotoPresetId>("id-2x2");
  const [paperId, setPaperId] = useState<PaperId>("a4");
  const [landscape, setLandscape] = useState(false);
  const [margin, setMargin] = useState("5");
  const [gap, setGap] = useState("3");
  const [cutMarks, setCutMarks] = useState(false);
  const [fitToOneSheet, setFitToOneSheet] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [exportStatus, setExportStatus] = useState<{ message: string; error?: boolean }>();
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [cropId, setCropId] = useState<string>();
  const [editId, setEditId] = useState<string>();
  const [requestedPage, setRequestedPage] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const mounted = useRef(false);
  const dragDepth = useRef(0);
  const urls = useRef(new Set<string>());

  useEffect(() => {
    mounted.current = true;
    const activeUrls = urls.current;
    return () => {
      mounted.current = false;
      activeUrls.forEach((url) => URL.revokeObjectURL(url));
      activeUrls.clear();
    };
  }, []);

  const preset = photoPresets.find((item) => item.id === presetId) ?? photoPresets[1];
  const selectedPaper = paperPresets.find((item) => item.id === paperId) ?? paperPresets[0];
  const settings: PrintSettings = useMemo(() => ({
    paper: landscape
      ? { widthMm: selectedPaper.heightMm, heightMm: selectedPaper.widthMm }
      : { widthMm: selectedPaper.widthMm, heightMm: selectedPaper.heightMm },
    photo: preset, margin: inputNumber(margin), gap: inputNumber(gap), cutMarks, fitToOneSheet,
  }), [selectedPaper, landscape, preset, margin, gap, cutMarks, fitToOneSheet]);
  const paper = settings.paper;
  const { document, layoutError, capacity } = useMemo(() => {
    try {
      const document = buildPrintDocument(settings, photos);
      const frame = photos[0]?.photo ?? preset;
      const scale = document.scale ?? 1;
      return {
        document,
        layoutError: undefined,
        capacity: gridFor({ ...settings, photo: { widthMm: frame.widthMm * scale, heightMm: frame.heightMm * scale } }).capacity,
      };
    } catch (error) {
      return {
        document: undefined,
        layoutError: error instanceof Error ? error.message : "This layout couldn’t be prepared.",
        capacity: 0,
      };
    }
  }, [settings, photos, preset]);
  const printScale = document?.scale ?? 1;
  const printScaleLabel = `${scaleFormat.format(printScale * 100)}%`;

  const pages = document?.pages.length ?? 0;
  const pageIndex = Math.max(0, Math.min(requestedPage, pages - 1));
  const placeholders = photos.length === 0 && capacity
    ? buildPrintDocument({ ...settings, cutMarks: false, fitToOneSheet: false }, [
        { assetId: "", width: 1, height: 1, copies: capacity, cropSettings: initialCrop },
      ]).pages[0].photos
    : [];
  const previews = new Map(photos.map((photo) => [photo.assetId, photo]));
  const sizeCount = new Set(photos.map(({ photo }) => `${photo.widthMm}x${photo.heightMm}`)).size;
  const lowDpi = photos.filter((photo) => effectiveDpi(sourceCrop(photo, photo.photo, photo.cropSettings), {
    widthMm: photo.photo.widthMm * printScale, heightMm: photo.photo.heightMm * printScale,
  }) < 300);
  const currentCrop = photos.find((photo) => photo.id === cropId);
  const currentEdit = photos.find((photo) => photo.id === editId);

  async function addPhotos(files: File[]) {
    if (!files.length || uploading.current) return;
    uploading.current = true;
    setLoadingPhotos(true);
    setUploadErrors([]);
    setExportStatus(undefined);
    const slots = Math.min(maxFiles - previews.size, maxLineItems - photos.length);
    const errors: string[] = [];
    const added: Photo[] = [];
    let availablePixels = maxJobPixels - [...previews.values()].reduce((sum, photo) => sum + photo.width * photo.height, 0);
    try {
      for (const file of files.slice(0, slots)) {
        try {
          const { thumbnail, ...image } = await importPhoto(file, availablePixels);
          if (!mounted.current) return;
          const assetId = crypto.randomUUID();
          const url = URL.createObjectURL(thumbnail);
          urls.current.add(url);
          availablePixels -= image.width * image.height;
          added.push({
            ...image, assetId, id: crypto.randomUUID(), name: file.name, url, copies: 1,
            cropSettings: initialCrop, presetId, photo: { widthMm: preset.widthMm, heightMm: preset.heightMm },
          });
        } catch (error) {
          errors.push(`${file.name}: ${error instanceof Error ? error.message : "This photo couldn’t be added."}`);
        }
      }
      if (files.length > slots) errors.push(`A job can hold up to ${maxFiles} source photos and ${maxLineItems} print entries.`);
      setPhotos((current) => [...current, ...added]);
      setUploadErrors(errors);
    } finally {
      uploading.current = false;
      setLoadingPhotos(false);
    }
  }

  function removePhoto(photo: Photo) {
    setPhotos((current) => current.filter((item) => item.id !== photo.id));
    if (!photos.some((item) => item.id !== photo.id && item.assetId === photo.assetId)) {
      URL.revokeObjectURL(photo.url);
      urls.current.delete(photo.url);
    }
  }

  function setPhotoSize(id: string, nextPresetId: PhotoPresetId) {
    const frame = photoPresets.find((item) => item.id === nextPresetId);
    if (!frame) return;
    setPhotos((current) => current.map((item) => item.id === id
      ? { ...item, presetId: nextPresetId, photo: { widthMm: frame.widthMm, heightMm: frame.heightMm } }
      : item));
    setRequestedPage(0);
  }

  function addAnotherSize(photo: Photo) {
    const nextPreset = photo.presetId === "id-1x1" ? photoPresets[1] : photoPresets[0];
    const nextPhoto = {
      ...photo, id: crypto.randomUUID(), presetId: nextPreset.id, copies: 1,
      cropSettings: initialCrop,
      photo: { widthMm: nextPreset.widthMm, heightMm: nextPreset.heightMm },
    };
    setPhotos((current) => {
      if (current.length >= maxLineItems) return current;
      const next = [...current];
      next.splice(next.findIndex((item) => item.id === photo.id) + 1, 0, nextPhoto);
      return next;
    });
    setRequestedPage(0);
  }

  function movePhoto(index: number, offset: number) {
    setPhotos((current) => {
      const next = [...current];
      const destination = index + offset;
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  async function download() {
    if (!document?.pages.length || exporting) return;
    setExporting(true);
    setExportStatus(undefined);
    try {
      const { exportPdf } = await import("@/features/print/export-pdf");
      const bytes = await exportPdf(document, previews);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = "sdms-quick-print.pdf";
      window.document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setExportStatus({ message: `Downloaded a PDF with ${pages} ${pages === 1 ? "sheet" : "sheets"}.` });
    } catch (error) {
      setExportStatus({ message: error instanceof Error ? error.message : "Couldn’t prepare the PDF.", error: true });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="workspace">
      <div className="setup-column">
        <Step number="01" title="Choose a starting size">
          <fieldset className="presets">
            <legend className="sr-only">Finished photo size</legend>
            {popularPhotoPresets.map((photo) => (
              <label className="preset-option" key={photo.id}>
                <input type="radio" name="photo-size" checked={presetId === photo.id}
                  onChange={() => { setPresetId(photo.id); setRequestedPage(0); }} />
                <span className="preset-tile">
                  <span className="size-icon" aria-hidden style={{ aspectRatio: `${photo.widthMm} / ${photo.heightMm}` }} />
                  <strong>{photo.label}</strong>
                  <small>{photo.note}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="preset-catalog">
            <label className="field">
              <span>All photo sizes</span>
              <select value={presetId} onChange={(event) => { setPresetId(event.target.value as PhotoPresetId); setRequestedPage(0); }}>
                <PhotoSizeOptions />
              </select>
            </label>
            <button className="text-button" type="button" disabled={!photos.length} onClick={() => {
              setPhotos((current) => current.map((item) => ({
                ...item, presetId, photo: { widthMm: preset.widthMm, heightMm: preset.heightMm },
              })));
              setRequestedPage(0);
            }}>Apply to all</button>
          </div>
          <p className="step-note">New photos use this size. Each photo can have its own size below.</p>
        </Step>

        <Step number="02" title="Add your photos">
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple
            aria-label="Upload photos" className="sr-only" tabIndex={-1}
            onChange={(event) => { void addPhotos(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
          <button type="button" className={`drop-zone${dragging ? " is-dragging" : ""}`} disabled={loadingPhotos}
            onClick={() => fileInput.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); dragDepth.current++; setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => { if (--dragDepth.current <= 0) setDragging(false); }}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              void addPhotos(Array.from(event.dataTransfer.files));
            }}>
            <span className="upload-icon"><ImagePlus size={21} aria-hidden /></span>
            <span>
              <strong>{loadingPhotos ? "Preparing photos…" : "Drop photos here or browse"}</strong>
              <small>JPEG or PNG · Up to 20 MB each</small>
            </span>
          </button>
          {uploadErrors.length > 0 && <ul className="notice error" role="alert">
            {uploadErrors.map((error, index) => <li key={index}>{error}</li>)}
          </ul>}
          {photos.length > 0 && (
            <ul className="photo-list">
              {photos.map((photo, index) => {
                const crop = sourceCrop(photo, photo.photo, photo.cropSettings);
                const printedSize = { widthMm: photo.photo.widthMm * printScale, heightMm: photo.photo.heightMm * printScale };
                const dpi = effectiveDpi(crop, printedSize);
                const itemLabel = `${photo.name}, item ${index + 1}`;
                const edited = (photo.adjustments?.brightness ?? 0) !== 0 || (photo.adjustments?.contrast ?? 0) !== 0;
                return (
                  <li className="photo-item" key={photo.id}>
                    <div className="photo-details">
                      <span className="photo-thumb" style={{ aspectRatio: `${photo.photo.widthMm} / ${photo.photo.heightMm}` }}>
                        <PhotoPreview url={photo.url} source={photo} crop={crop} adjustments={photo.adjustments} />
                      </span>
                      <div className="photo-info">
                        <strong title={photo.name}>{photo.name}</strong>
                        <span className={dpi < 300 ? "dpi-warning" : ""}>
                          {Math.round(dpi)} DPI {dpi < 150 ? "· Very low" : dpi < 300 ? "· Low" : ""}{edited && " · Edited"}
                        </span>
                      </div>
                      <button type="button" className="icon-button" aria-label={`Edit ${itemLabel}`} title="Brightness and contrast" onClick={() => setEditId(photo.id)}><SlidersHorizontal size={16} /></button>
                      <button type="button" className="icon-button" aria-label={`Crop ${itemLabel}`} title="Crop photo" onClick={() => setCropId(photo.id)}><Crop size={16} /></button>
                      {photos.length > 1 && (
                        <div className="reorder-buttons">
                          <button type="button" className="icon-button" aria-label={`Move ${itemLabel} up`} disabled={index === 0} onClick={() => movePhoto(index, -1)}><ArrowUp size={13} /></button>
                          <button type="button" className="icon-button" aria-label={`Move ${itemLabel} down`} disabled={index === photos.length - 1} onClick={() => movePhoto(index, 1)}><ArrowDown size={13} /></button>
                        </div>
                      )}
                      <button type="button" className="icon-button remove-button" aria-label={`Remove ${itemLabel}`} title="Remove print entry" onClick={() => removePhoto(photo)}><X size={16} /></button>
                    </div>
                    <div className="photo-print-settings">
                      <label className="field photo-size-field">
                        <span>Print size</span>
                        <select aria-label={`Print size for ${itemLabel}`} value={photo.presetId}
                          onChange={(event) => setPhotoSize(photo.id, event.target.value as PhotoPresetId)}>
                          <PhotoSizeOptions />
                        </select>
                      </label>
                      <button type="button" className="icon-button" aria-label={`Swap width and height for ${itemLabel}`}
                        title={photo.photo.widthMm > photo.photo.heightMm ? "Switch to portrait frame" : "Switch to landscape frame"}
                        disabled={photo.photo.widthMm === photo.photo.heightMm}
                        onClick={() => setPhotos((current) => current.map((item) => item.id === photo.id
                          ? { ...item, photo: { widthMm: item.photo.heightMm, heightMm: item.photo.widthMm } } : item))}>
                        <RotateCw size={16} />
                      </button>
                      <label className="copies-field">
                        <span>Copies</span>
                        <input type="number" min={1} max={maxCopiesPerPhoto} step={1} aria-label={`Copies of ${itemLabel}`}
                          value={Number.isNaN(photo.copies) ? "" : photo.copies}
                          onChange={(event) => {
                            const copies = event.target.valueAsNumber;
                            setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, copies } : item));
                          }} />
                      </label>
                      <button type="button" className="icon-button add-size-button" aria-label={`Add another size of ${itemLabel}`}
                        title="Add another size of this photo" disabled={photos.length >= maxLineItems} onClick={() => addAnotherSize(photo)}>
                        <Plus size={17} />
                      </button>
                    </div>
                    <p className="photo-dimensions">
                      {printScale < 1 && <span>{photo.photo.widthMm} × {photo.photo.heightMm} mm selected → </span>}
                      <strong>{sizeFormat.format(printedSize.widthMm)} × {sizeFormat.format(printedSize.heightMm)} mm</strong>
                      {printScale < 1 && " printed"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          {photos.length > 0 && <p className="step-note">Use + to print the same photo in another size.</p>}
          <p className="step-note"><LockKeyhole size={13} aria-hidden /> Photos stay in this browser.</p>
        </Step>

        <Step number="03" title="Set up your sheet">
          <div className="settings-grid">
            <label className="field">
              <span>Paper size</span>
              <select value={paperId} onChange={(event) => { setPaperId(event.target.value as PaperId); setRequestedPage(0); }}>
                {paperPresets.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Orientation</span>
              <select value={landscape ? "landscape" : "portrait"} onChange={(event) => { setLandscape(event.target.value === "landscape"); setRequestedPage(0); }}>
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
            <label className="field">
              <span>Margin <small>(mm)</small></span>
              <input type="number" min={0} step="any" value={margin} onChange={(event) => setMargin(event.target.value)} />
            </label>
            <label className="field">
              <span>Gap <small>(mm)</small></span>
              <input type="number" min={0} step="any" value={gap} onChange={(event) => setGap(event.target.value)} />
            </label>
          </div>
          <label className="fit-toggle">
            <Shrink size={17} aria-hidden />
            <span>Fit all prints to one sheet <small>Reduce photo sizes together if needed</small></span>
            <input type="checkbox" checked={fitToOneSheet} onChange={(event) => {
              setFitToOneSheet(event.target.checked);
              setRequestedPage(0);
            }} />
          </label>
          {fitToOneSheet && document && photos.length > 0 && (
            <p className={`notice ${printScale < 1 ? "warning" : "success"}`} role="status">
              {printScale < 1
                ? `Prints reduced to ${printScaleLabel} of the selected sizes. The printed dimensions are shown below each photo.`
                : "All prints fit on one sheet at their selected sizes."}
            </p>
          )}
          <label className="cut-toggle">
            <Scissors size={16} aria-hidden />
            <span>Show cut marks <small>{Number(gap) === 0 ? "Add a gap to leave room for marks." : "Small guides for trimming"}</small></span>
            <input type="checkbox" checked={cutMarks} onChange={(event) => setCutMarks(event.target.checked)} />
          </label>
          {layoutError && <p className="notice error" role="alert"><TriangleAlert size={16} aria-hidden /> {layoutError}</p>}
        </Step>
      </div>

      <div className="preview-column">
        <SheetPreview
          paper={paper} paperLabel={selectedPaper.label} sheet={document?.pages[pageIndex]}
          placeholders={placeholders} previews={previews} pageIndex={pageIndex} pages={pages}
          total={document?.pages.reduce((sum, page) => sum + page.photos.length, 0) ?? 0}
          capacity={sizeCount > 1 ? null : capacity} sizeCount={sizeCount}
          printScaleLabel={fitToOneSheet && photos.length > 0 && document ? printScaleLabel : undefined}
          exporting={exporting} onPageChange={setRequestedPage} onExport={() => void download()}
        />
        {lowDpi.length > 0 && <p className="notice warning" role="status">
          <TriangleAlert size={16} aria-hidden />
          {lowDpi.length === 1 ? "One print entry is" : `${lowDpi.length} print entries are`} below 300 DPI at its printed size and may look soft.
        </p>}
        {exportStatus && <p className={`notice ${exportStatus.error ? "error" : "success"}`} role={exportStatus.error ? "alert" : "status"}>
          <FileImage size={16} aria-hidden /> {exportStatus.message}
        </p>}
      </div>

      {currentCrop && <CropDialog
        key={currentCrop.id} name={`${currentCrop.name} · ${sizeFormat.format(currentCrop.photo.widthMm * printScale)} × ${sizeFormat.format(currentCrop.photo.heightMm * printScale)} mm`}
        url={currentCrop.url} source={currentCrop}
        frame={{ widthMm: currentCrop.photo.widthMm * printScale, heightMm: currentCrop.photo.heightMm * printScale }}
        settings={currentCrop.cropSettings} onClose={() => setCropId(undefined)}
        adjustments={currentCrop.adjustments}
        onSave={(cropSettings) => {
          setPhotos((current) => current.map((photo) => photo.id === cropId ? { ...photo, cropSettings } : photo));
          setCropId(undefined);
        }}
      />}
      {currentEdit && <PhotoEditDialog
        key={currentEdit.id} name={currentEdit.name} url={currentEdit.url} source={currentEdit}
        crop={sourceCrop(currentEdit, currentEdit.photo, currentEdit.cropSettings)} adjustments={currentEdit.adjustments}
        onClose={() => setEditId(undefined)}
        onSave={(adjustments) => {
          setPhotos((current) => current.map((photo) => photo.id === editId ? { ...photo, adjustments } : photo));
          setEditId(undefined);
        }}
      />}
    </div>
  );
}
