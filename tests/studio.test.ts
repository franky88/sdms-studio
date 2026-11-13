import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioJob, validateStudioJob, type PhotoEntry, type StudioAsset } from "../src/features/studio/job";
import { createHistory, historyAssetIds, historyReducer } from "../src/features/studio/history";
import { applyIdPackage, builtinIdPackages, packageFromPhoto, validateIdPackage } from "../src/features/studio/id-packages";
import { createProjectRepository } from "../src/features/studio/project-repository";
import { buildPrintDocument, initialCrop } from "../src/features/print/geometry";

const entry: PhotoEntry = {
  id: "entry-1", assetId: "source-1", name: "Customer.jpg", width: 1200, height: 1600,
  copies: 2, presetId: "id-2x2", photo: { widthMm: 50.8, heightMm: 50.8 },
  cropSettings: { zoom: 1.5, horizontal: 20, vertical: 70 }, adjustments: { brightness: 15, contrast: -10 },
};
const source: StudioAsset = {
  id: entry.assetId, width: entry.width, height: entry.height, mime: "image/jpeg",
  blob: new Blob([new Uint8Array([255, 216, 255, 123])], { type: "image/jpeg" }),
  thumbnail: new Blob(["thumbnail bytes"], { type: "image/jpeg" }),
};
const job = () => ({ ...createStudioJob(), title: "School IDs", entries: [structuredClone(entry)] });
const repositories: ReturnType<typeof createProjectRepository>[] = [];
function repository() {
  const repo = createProjectRepository(`studio-test-${crypto.randomUUID()}`);
  repositories.push(repo);
  return repo;
}
afterEach(async () => { await Promise.all(repositories.splice(0).map((repo) => repo.close())); });

describe("Print job history", () => {
  it("groups typing and clears redo after a different edit", () => {
    const original = job();
    let history = createHistory(original);
    history = historyReducer(history, { type: "change", job: { ...original, margin: "1" }, group: "margin" });
    history = historyReducer(history, { type: "change", job: { ...original, margin: "12" }, group: "margin" });
    expect(history.past).toHaveLength(1);
    history = historyReducer(history, { type: "undo" });
    expect(history.present).toBe(original);
    history = historyReducer(history, { type: "redo" });
    expect(history.present.margin).toBe("12");
    history = historyReducer(history, { type: "undo" });
    history = historyReducer(history, { type: "change", job: { ...original, gap: "4" } });
    expect(history.future).toHaveLength(0);
  });

  it("retains sources needed by undo and redo, with no binary snapshots", () => {
    const uploaded = job();
    let history = createHistory(createStudioJob());
    history = historyReducer(history, { type: "change", job: uploaded });
    history = historyReducer(history, { type: "change", job: { ...uploaded, entries: [] } });
    expect(historyAssetIds(history)).toEqual(new Set([entry.assetId]));
    history = historyReducer(history, { type: "undo" });
    expect(history.present.entries[0]).toEqual(entry);
    expect(JSON.stringify(history)).not.toMatch(/blob|thumbnail|url/);
    history = historyReducer(history, { type: "replace", job: createStudioJob() });
    expect(historyAssetIds(history).size).toBe(0);
    expect(history.past.length + history.future.length).toBe(0);
  });

  it("limits history to fifty transactions and separates blurred inputs", () => {
    let history = createHistory(job());
    for (let i = 0; i < 60; i++) history = historyReducer(history, { type: "change", job: { ...history.present, margin: String(i) } });
    expect(history.past).toHaveLength(50);
    history = historyReducer(history, { type: "change", job: { ...history.present, gap: "1" }, group: "gap" });
    history = historyReducer(history, { type: "end-group" });
    history = historyReducer(history, { type: "change", job: { ...history.present, gap: "2" }, group: "gap" });
    history = historyReducer(history, { type: "undo" });
    expect(history.present.gap).toBe("1");
  });
});

describe("ID packages", () => {
  it("applies a mixed set at exact sizes, preserving other photos and matching edits", () => {
    const original = { ...job(), fitToOneSheet: true, entries: [entry, { ...entry, id: "other", assetId: "other-source" }] };
    const applied = applyIdPackage(original, entry.assetId, builtinIdPackages[0], () => "new-size");
    expect(applied.entries.map((line) => line.copies)).toEqual([4, 8, 2]);
    expect(applied.entries[0].cropSettings).toEqual(entry.cropSettings);
    expect(applied.entries[0].adjustments).toEqual(entry.adjustments);
    expect(applied.entries[1].cropSettings).toEqual(initialCrop);
    expect(applied.entries[1].adjustments).toEqual(entry.adjustments);
    expect(applied.entries[2]).toBe(original.entries[1]);
    expect(applied.fitToOneSheet).toBe(false);
    const print = buildPrintDocument({ paper: { widthMm: 210, heightMm: 297 }, photo: entry.photo, margin: 5, gap: 3, cutMarks: false }, applied.entries);
    expect(print.pages.flatMap((page) => page.photos).filter((photo) => photo.assetId === entry.assetId)).toHaveLength(12);
    const history = historyReducer(createHistory(original), { type: "change", job: applied });
    expect(historyReducer(history, { type: "undo" }).present).toBe(original);
  });

  it("saves only sizes and combined quantities for custom packages", () => {
    const original = job();
    original.entries.push({ ...entry, id: "duplicate", copies: 3 });
    const saved = packageFromPhoto(original, entry.assetId, "  School set  ", "custom");
    expect(saved).toEqual({ id: "custom", name: "School set", items: [{ presetId: "id-2x2", copies: 5 }] });
    expect(JSON.stringify(saved)).not.toMatch(/Customer|source-1|crop|brightness/);
  });

  it("rejects empty, non-ID, rotated, duplicate or invalid-count packages", () => {
    for (const copies of [NaN, 0, 1.5, 1001]) {
      expect(() => validateIdPackage({ id: "test", name: "Set", items: [{ presetId: "id-2x2", copies }] })).toThrow();
    }
    expect(() => validateIdPackage({ id: "t", name: "Set", items: [{ presetId: "4r", copies: 1 }] })).toThrow();
    expect(() => packageFromPhoto(createStudioJob(), "missing", "Set", "t")).toThrow();
    const rotated = { ...job(), entries: [{ ...entry, presetId: "id-35x45" as const, photo: { widthMm: 45, heightMm: 35 } }] };
    expect(() => packageFromPhoto(rotated, entry.assetId, "Set", "t")).toThrow();
    expect(() => applyIdPackage(job(), "missing", builtinIdPackages[0], () => "t")).toThrow();
    expect(() => validateIdPackage(null)).toThrow();
  });
});

describe("Local project repository", () => {
  it("round-trips original image bytes and every editable setting after reconnecting", async () => {
    const repo = repository();
    const original = { ...job(), paperId: "letter" as const, landscape: true, margin: "7.5", gap: "2", cutMarks: true, fitToOneSheet: true };
    original.entries.push({ ...entry, id: "second", copies: 8, presetId: "id-1x1", photo: { widthMm: 25.4, heightMm: 25.4 } });
    const summary = await repo.saveProject("project", 0, original, new Map([[source.id, source]]));
    expect(summary.printCount).toBe(10);
    await repo.close();
    const loaded = await repo.loadProject("project");
    expect(loaded?.job).toEqual(original);
    expect(loaded?.assets).toHaveLength(1);
    expect(await loaded?.assets[0].blob.arrayBuffer()).toEqual(await source.blob.arrayBuffer());
    expect(await loaded?.assets[0].thumbnail.text()).toBe("thumbnail bytes");
    expect(await repo.lastProjectId()).toBe("project");
    expect((await repo.listProjects())[0]).not.toHaveProperty("job");
  });

  it("preserves an unfinished numeric draft and strips runtime fields", async () => {
    const repo = repository();
    const draft = { ...job(), margin: "", entries: [{ ...entry, copies: NaN, url: "blob:runtime", blob: source.blob }] };
    await repo.saveProject("draft", 0, draft, new Map([[source.id, source]]));
    const saved = (await repo.loadProject("draft"))!.job;
    expect(saved.margin).toBe("");
    expect(saved.entries[0].copies).toBeNaN();
    expect(saved.entries[0]).not.toHaveProperty("blob");
    expect(saved.entries[0]).not.toHaveProperty("url");
    expect(validateStudioJob({ ...job(), entries: [{ ...entry, adjustments: undefined }] }).entries[0].adjustments).toBeUndefined();
  });

  it("rejects missing sources before writing any project", async () => {
    const repo = repository();
    await expect(repo.saveProject("broken", 0, job(), new Map())).rejects.toThrow("missing or damaged");
    await expect(repo.saveProject("broken", 0, job(), new Map([[source.id, { ...source, width: 1 }]]))).rejects.toThrow("inconsistent");
    expect(await repo.listProjects()).toEqual([]);
    expect(await repo.lastProjectId()).toBeUndefined();
  });

  it("prevents stale writes atomically and allows a separate saved copy", async () => {
    const repo = repository();
    const sources = new Map([[source.id, source]]);
    await repo.saveProject("job", 0, job(), sources);
    const outcomes = await Promise.allSettled([
      repo.saveProject("job", 1, { ...job(), title: "Tab A" }, sources),
      repo.saveProject("job", 1, { ...job(), title: "Tab B" }, sources),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const conflict = outcomes.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(conflict.reason.message).toContain("another tab");
    await repo.saveProject("copy", 0, { ...job(), title: "My copy" }, sources);
    expect(await repo.listProjects()).toHaveLength(2);
    expect((await repo.loadProject("job"))?.revision).toBe(2);
    await repo.activateProject("job");
    expect(await repo.lastProjectId()).toBe("job");
  });

  it("rolls back the entire save when browser storage fails", async () => {
    const repo = repository();
    const sources = new Map([[source.id, source]]);
    await repo.saveProject("original", 0, job(), sources);
    const originalPut = IDBObjectStore.prototype.put;
    const failWrite = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === "projects") throw new DOMException("Storage full", "QuotaExceededError");
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key);
    });
    try {
      await expect(repo.saveProject("partial", 0, job(), sources)).rejects.toThrow("Storage full");
    } finally { failWrite.mockRestore(); }
    expect((await repo.listProjects()).map((project) => project.id)).toEqual(["original"]);
    expect(await repo.lastProjectId()).toBe("original");
    expect((await repo.loadProject("original"))?.job).toEqual(job());
    await repo.saveProject("partial", 0, job(), sources);
    expect(await repo.listProjects()).toHaveLength(2);
  });

  it("persists reusable packages and rejects duplicate names", async () => {
    const repo = repository();
    await repo.savePackage({ ...builtinIdPackages[0], id: "custom", name: "School set" });
    await expect(repo.savePackage({ ...builtinIdPackages[1], id: "second", name: " SCHOOL SET " })).rejects.toThrow("already exists");
    await repo.close();
    expect(await repo.listPackages()).toEqual([{ ...builtinIdPackages[0], id: "custom", name: "School set" }]);
  });

  it("deletes only the selected custom package durably and frees its name", async () => {
    const repo = repository();
    const retained = { ...builtinIdPackages[1], id: "retained", name: "Staff set" };
    await repo.savePackage({ ...builtinIdPackages[0], id: "removed", name: "School set" });
    await repo.savePackage(retained);
    await repo.saveProject("project", 0, job(), new Map([[source.id, source]]));
    await repo.deletePackage("removed");
    await repo.close();
    expect(await repo.listPackages()).toEqual([retained]);
    expect((await repo.loadProject("project"))?.job).toEqual(job());
    await repo.savePackage({ ...builtinIdPackages[2], id: "replacement", name: "School set" });
    expect(await repo.listPackages()).toHaveLength(2);
    await repo.deletePackage("removed");
    expect(await repo.listPackages()).toHaveLength(2);
    await expect(repo.deletePackage(builtinIdPackages[0].id)).rejects.toThrow("Built-in");
    expect(await repo.listPackages()).toHaveLength(2);
  });
});
