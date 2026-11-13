"use client";

import { useRef, useState } from "react";
import { Package, Plus, Trash2 } from "lucide-react";
import { applyIdPackage, builtinIdPackages, type IdPackage } from "@/features/studio/id-packages";
import { photoPresets } from "@/features/print/presets";
import type { StudioJob } from "@/features/studio/job";

export function IdPackages({ job, customPackages, onApply, onSave, onDelete }: {
  job: StudioJob;
  customPackages: IdPackage[];
  onApply: (job: StudioJob) => void;
  onSave: (assetId: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<IdPackage>();
  const [deleting, setDeleting] = useState(false);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const working = saving || deleting;
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const sources = [...new Map(job.entries.map((entry) => [entry.assetId, entry])).values()];
  const assetId = sources.some((entry) => entry.assetId === selected) ? selected : sources[0]?.assetId ?? "";

  function apply(definition: IdPackage) {
    try {
      onApply(applyIdPackage(job, assetId, definition, () => crypto.randomUUID()));
      setNotice({ text: `${definition.name} applied. You can adjust each size below.` });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Couldn’t apply this package.", error: true });
    }
  }

  async function save() {
    if (working) return;
    setSaving(true);
    try {
      await onSave(assetId, name);
      setName("");
      setNotice({ text: "Package saved. Reuse it with any photo or project." });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Couldn’t save this package.", error: true });
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!pendingDelete || working) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(undefined);
      setNotice({ text: "Package deleted." });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Couldn’t delete this package. Please retry.", error: true });
    } finally { setDeleting(false); }
  }

  return (
    <div className="id-packages" aria-label="ID packages">
      <div className="package-heading"><Package size={17} aria-hidden /><h3>One-click ID packages</h3><span>QUICK START</span></div>
      {sources.length > 1 && <label className="field package-source"><span>Apply to photo</span>
        <select aria-label="Photo for ID package" value={assetId} onChange={(event) => { setSelected(event.target.value); setNotice(undefined); }}>
          {sources.map((entry, index) => <option key={entry.assetId} value={entry.assetId}>{index + 1}. {entry.name}</option>)}
        </select>
      </label>}
      <div className="package-grid">
        {[...builtinIdPackages, ...customPackages].map((definition) => {
          const custom = customPackages.some((item) => item.id === definition.id);
          return <div className={`package-tile${custom ? " is-custom" : ""}`} key={definition.id}>
            <button type="button" className="package-card" disabled={!assetId || working} onClick={() => apply(definition)}>
              <strong>{definition.name}</strong>
              <span>{definition.items.map((item) => `${item.copies} × ${photoPresets.find((p) => p.id === item.presetId)?.label}`).join(" + ")}</span>
            </button>
            {custom && <button type="button" className="icon-button package-delete" aria-label={`Delete package ${definition.name}`}
              title={`Delete ${definition.name}`} disabled={working} onClick={(event) => { deleteTrigger.current = event.currentTarget; setPendingDelete(definition); setNotice(undefined); }}>
              <Trash2 size={13} aria-hidden />
            </button>}
          </div>;
        })}
      </div>
      {pendingDelete && <div className="package-delete-confirm" role="group" aria-label={`Delete package ${pendingDelete.name}?`}>
        <p>Delete “{pendingDelete.name}”? This removes the saved combination from this browser.</p>
        <div>
          <button type="button" className="button secondary" autoFocus disabled={working} onClick={() => { setPendingDelete(undefined); deleteTrigger.current?.focus(); }}>Cancel</button>
          <button type="button" className="button danger" disabled={working} onClick={() => { void remove(); }}>{deleting ? "Deleting…" : "Delete package"}</button>
        </div>
      </div>}
      <p className="step-note">{assetId ? "Replaces this photo’s print entries using exact ID sizes." : "Add a photo above, then choose a package."}</p>
      <details className="custom-package">
        <summary>Save your own combination</summary>
        <p>Set the ID sizes and copies for one photo, then save the combination. Packages contain sizes and quantities only.</p>
        <div className="custom-package-form">
          <label className="field"><span>Package name</span><input maxLength={60} placeholder="e.g. School ID set" value={name}
            onChange={(event) => setName(event.target.value)} /></label>
          <button className="button secondary" type="button" disabled={!assetId || !name.trim() || working} onClick={() => { void save(); }}>
            <Plus size={15} /> {saving ? "Saving…" : "Save ID set"}
          </button>
        </div>
      </details>
      {notice && <p className={`notice ${notice.error ? "error" : "success"}`} role={notice.error ? "alert" : "status"}>{notice.text}</p>}
    </div>
  );
}
