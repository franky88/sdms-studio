"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createHistory, historyAssetIds, historyReducer, type HistoryAction } from "./history";
import { createStudioJob, type AssetPreview, type PhotoEntry, type StudioAsset, type StudioJob } from "./job";
import { packageFromPhoto, type IdPackage } from "./id-packages";
import { projectRepository, type ProjectSummary } from "./project-repository";

function messageFor(error: unknown) {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "This browser’s storage is full. Free storage and retry Save. You can still download the PDF.";
  }
  return error instanceof Error ? error.message : "Couldn’t save in this browser. Please retry.";
}

export function useStudio(busy: boolean) {
  const [history, setHistory] = useState(() => createHistory(createStudioJob()));
  const historyRef = useRef(history);
  const [assets, setAssets] = useState<ReadonlyMap<string, AssetPreview>>(() => new Map());
  const assetsRef = useRef(assets);
  const active = useRef<{ id: string; revision: number } | undefined>(undefined);
  const [activeId, setActiveId] = useState("");
  const [ready, setReady] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const switching = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [savedJob, setSavedJob] = useState(history.present);
  const savedRef = useRef(history.present);
  const inFlight = useRef<Promise<void> | undefined>(undefined);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [customPackages, setCustomPackages] = useState<IdPackage[]>([]);

  const dispatch = useCallback((action: HistoryAction) => {
    const next = historyReducer(historyRef.current, action);
    historyRef.current = next;
    setHistory(next);
    const keep = historyAssetIds(next);
    const current = assetsRef.current;
    if ([...current.keys()].some((id) => !keep.has(id))) {
      const retained = new Map(current);
      for (const [id, asset] of retained) {
        if (keep.has(id)) continue;
        URL.revokeObjectURL(asset.url);
        retained.delete(id);
      }
      assetsRef.current = retained;
      setAssets(retained);
    }
  }, []);

  const changeJob = useCallback((update: (job: StudioJob) => StudioJob, group?: string) => {
    dispatch({ type: "change", job: update(historyRef.current.present), group });
  }, [dispatch]);
  const endGroup = useCallback(() => dispatch({ type: "end-group" }), [dispatch]);
  const undo = useCallback(() => dispatch({ type: "undo" }), [dispatch]);
  const redo = useCallback(() => dispatch({ type: "redo" }), [dispatch]);

  const install = useCallback((job: StudioJob, sources: StudioAsset[], id: string, revision: number) => {
    const previous = assetsRef.current;
    const next = new Map(sources.map((source) => [source.id, { ...source, url: URL.createObjectURL(source.thumbnail) }]));
    assetsRef.current = next;
    setAssets(next);
    dispatch({ type: "replace", job });
    previous.forEach((asset) => URL.revokeObjectURL(asset.url));
    active.current = { id, revision };
    setActiveId(id);
    savedRef.current = job;
    setSavedJob(job);
    setSaveError(undefined);
  }, [dispatch]);

  const updateCatalog = useCallback((summary: ProjectSummary) => {
    setProjects((current) => [summary, ...current.filter((project) => project.id !== summary.id)]);
  }, []);

  const flush = useCallback(async (force = false): Promise<void> => {
    while (inFlight.current) await inFlight.current;
    const project = active.current;
    const snapshot = historyRef.current.present;
    if (!project || (!force && snapshot === savedRef.current)) return;
    const sources = assetsRef.current;
    setSaving(true);
    const operation = (async () => {
      try {
        const summary = await projectRepository.saveProject(project.id, project.revision, snapshot, sources);
        project.revision = summary.revision;
        savedRef.current = snapshot;
        setSavedJob(snapshot);
        updateCatalog(summary);
        setSaveError(undefined);
      } catch (error) {
        setSaveError(messageFor(error));
        throw error;
      } finally {
        setSaving(false);
      }
    })();
    inFlight.current = operation;
    try { await operation; } finally {
      if (inFlight.current === operation) inFlight.current = undefined;
    }
  }, [updateCatalog]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [catalog, packages, lastId] = await Promise.all([
          projectRepository.listProjects(), projectRepository.listPackages(), projectRepository.lastProjectId(),
        ]);
        const project = lastId ? await projectRepository.loadProject(lastId) : undefined;
        if (cancelled) return;
        setProjects(catalog);
        setCustomPackages(packages);
        if (project) install(project.job, project.assets, project.id, project.revision);
        else install(createStudioJob(), [], crypto.randomUUID(), 0);
      } catch (error) {
        if (cancelled) return;
        install(createStudioJob(), [], crypto.randomUUID(), 0);
        setSaveError(`Couldn’t restore saved projects. ${messageFor(error)}`);
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [install]);

  useEffect(() => () => {
    assetsRef.current.forEach((asset) => URL.revokeObjectURL(asset.url));
  }, []);

  useEffect(() => {
    if (!ready || transitioning || history.present === savedRef.current) return;
    const timer = window.setTimeout(() => { void flush().catch(() => undefined); }, 650);
    return () => window.clearTimeout(timer);
  }, [history.present, savedJob, ready, transitioning, flush]);

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (historyRef.current.present === savedRef.current && !inFlight.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function hidden() {
      if (document.visibilityState === "hidden") void flush().catch(() => undefined);
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [flush]);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (!ready || busy || transitioning || document.querySelector("dialog[open]") ||
          !(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable]")) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) redo(); else undo();
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [ready, busy, transitioning, undo, redo]);

  function addImportedPhotos(sources: StudioAsset[], entries: PhotoEntry[]) {
    if (!entries.length) return;
    const next = new Map(assetsRef.current);
    sources.forEach((source) => next.set(source.id, { ...source, url: URL.createObjectURL(source.thumbnail) }));
    assetsRef.current = next;
    setAssets(next);
    changeJob((job) => ({ ...job, entries: [...job.entries, ...entries] }));
  }

  async function switchProject(id?: string) {
    if (switching.current) return false;
    switching.current = true;
    setTransitioning(true);
    try {
      await flush();
      if (id) {
        const project = await projectRepository.loadProject(id);
        if (!project) throw new Error("This saved project is no longer available.");
        await projectRepository.activateProject(id);
        install(project.job, project.assets, project.id, project.revision);
      } else {
        install(createStudioJob(), [], crypto.randomUUID(), 0);
      }
      return true;
    } catch (error) {
      setSaveError(messageFor(error));
      return false;
    } finally {
      switching.current = false;
      setTransitioning(false);
    }
  }

  async function saveCopy() {
    if (switching.current) return;
    switching.current = true;
    setTransitioning(true);
    try {
      await inFlight.current?.catch(() => undefined);
      const job = { ...historyRef.current.present, title: `${historyRef.current.present.title.slice(0, 75)} copy` };
      const id = crypto.randomUUID();
      const summary = await projectRepository.saveProject(id, 0, job, assetsRef.current);
      install(job, [...assetsRef.current.values()].filter((asset) => job.entries.some((entry) => entry.assetId === asset.id)), id, summary.revision);
      updateCatalog(summary);
    } catch (error) {
      setSaveError(messageFor(error));
    } finally {
      switching.current = false;
      setTransitioning(false);
    }
  }

  async function savePackage(assetId: string, name: string) {
    const definition = packageFromPhoto(historyRef.current.present, assetId, name, crypto.randomUUID());
    await projectRepository.savePackage(definition);
    setCustomPackages((current) => [...current, definition]);
  }

  async function refreshProjects() {
    try { setProjects(await projectRepository.listProjects()); }
    catch (error) { setSaveError(messageFor(error)); }
  }

  return {
    job: history.present, assets, changeJob, endGroup, undo, redo,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    ready, transitioning, saving, saveError, dirty: history.present !== savedJob,
    activeId, projects, customPackages, addImportedPhotos, switchProject, saveCopy, savePackage, refreshProjects,
    saveNow: () => { void flush(true).catch(() => undefined); },
  };
}
