"use client";

import { useState } from "react";
import { Check, Copy, FolderOpen, LoaderCircle, Plus, Redo2, Save, Undo2 } from "lucide-react";
import type { useStudio } from "@/features/studio/use-studio";

export function ProjectToolbar({ studio, busy, onSwitch }: {
  studio: ReturnType<typeof useStudio>;
  busy: boolean;
  onSwitch: (id?: string) => void;
}) {
  const [showProjects, setShowProjects] = useState(false);
  const disabled = busy || !studio.ready || studio.transitioning;
  const status = !studio.ready ? "Loading projects…" : studio.transitioning ? "Opening project…" : studio.saving ? "Saving…"
    : studio.saveError ? "Save needs attention" : studio.dirty ? "Unsaved changes" : studio.projects.some((p) => p.id === studio.activeId) ? "Saved locally" : "Ready to print";
  return (
    <section className="panel project-panel" aria-label="Project and history">
      <div className="project-topline">
        <label className="project-title">
          <span>YOUR PRINT JOB</span>
          <input aria-label="Project name" maxLength={80} value={studio.job.title} disabled={disabled}
            onChange={(event) => studio.changeJob((job) => ({ ...job, title: event.target.value }), "project-title")}
            onBlur={studio.endGroup} />
        </label>
        <div className={`save-status${studio.saveError ? " has-error" : ""}`} role="status">
          {studio.saving || !studio.ready || studio.transitioning ? <LoaderCircle size={14} className="spin" />
            : !studio.dirty && !studio.saveError ? <Check size={14} /> : <span className="status-dot" />}
          {status}
        </div>
      </div>
      <div className="project-controls">
        <div className="project-buttons">
          <button className="button secondary" disabled={disabled} aria-expanded={showProjects} onClick={() => {
            setShowProjects(!showProjects);
            if (!showProjects) void studio.refreshProjects();
          }}><FolderOpen size={15} /> Projects</button>
          <button className="button secondary" disabled={disabled} onClick={() => { setShowProjects(false); onSwitch(); }}><Plus size={15} /> New</button>
          <button className="button secondary" disabled={disabled || studio.saving} onClick={studio.saveNow}><Save size={15} /> Save</button>
          <button className="button secondary" disabled={disabled || studio.saving} onClick={() => { void studio.saveCopy(); }}><Copy size={15} /> Save copy</button>
        </div>
        <div className="history-buttons">
          <button className="icon-button" aria-label="Undo" title="Undo (Ctrl / ⌘ Z)" disabled={disabled || !studio.canUndo} onClick={studio.undo}><Undo2 size={17} /></button>
          <button className="icon-button" aria-label="Redo" title="Redo (Ctrl Y / ⌘ Shift Z)" disabled={disabled || !studio.canRedo} onClick={studio.redo}><Redo2 size={17} /></button>
        </div>
      </div>
      <p className="project-note">Autosaved with original photos in this browser. Use Projects to reopen a job.</p>
      {studio.saveError && <p className="notice error" role="alert">{studio.saveError} Your current edits are still open. Retry Save or use Save copy.</p>}
      {showProjects && <div className="saved-projects">
        <h2>Saved projects</h2>
        {studio.projects.length === 0 && <p>No saved jobs yet. Your first change will save this job automatically.</p>}
        {studio.projects.map((project) => <button className="saved-project" key={project.id} disabled={disabled}
          onClick={() => { setShowProjects(false); onSwitch(project.id); }}>
          <FolderOpen size={17} aria-hidden />
          <span><strong>{project.title}</strong><small>{project.printCount} prints · {new Date(project.updatedAt).toLocaleString()}</small></span>
          {project.id === studio.activeId && <small>Current</small>}
        </button>)}
      </div>}
    </section>
  );
}
