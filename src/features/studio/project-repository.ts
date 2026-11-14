import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { builtinIdPackages, validateIdPackage, type IdPackage } from "./id-packages";
import { validateStudioJob, type StudioAsset, type StudioJob } from "./job";
import { maxImagePixels } from "../print/import-photo";
import { assetDependencies } from "./asset-dependencies";

export type ProjectSummary = {
  id: string;
  title: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  entryCount: number;
  printCount: number;
};
type ProjectRecord = ProjectSummary & { job: StudioJob };
type PackageRecord = IdPackage & { nameKey: string };

interface StudioDatabase extends DBSchema {
  projects: { key: string; value: ProjectRecord };
  assets: { key: string; value: StudioAsset };
  preferences: { key: string; value: { key: string; value: string } };
  packages: { key: string; value: PackageRecord; indexes: { nameKey: string } };
}

function validateAsset(asset: StudioAsset | undefined): StudioAsset {
  if (!asset || !(asset.blob instanceof Blob) || !(asset.thumbnail instanceof Blob) ||
      !["image/jpeg", "image/png"].includes(asset.mime) ||
      !Number.isSafeInteger(asset.width) || !Number.isSafeInteger(asset.height) ||
      asset.width < 1 || asset.height < 1 || asset.width * asset.height > maxImagePixels) {
    throw new Error("A source photo is missing or damaged in this saved project.");
  }
  if (asset.originalId !== undefined && (typeof asset.originalId !== "string" || !asset.originalId || asset.originalId === asset.id || !(asset.backgroundMask instanceof Blob) || asset.mime !== "image/png" ||
      (asset.backgroundColor !== "transparent" && !/^#[0-9a-f]{6}$/i.test(asset.backgroundColor ?? "")))) {
    throw new Error("A saved background edit is damaged.");
  }
  return asset;
}

function summary(record: ProjectRecord): ProjectSummary {
  const { id, title, revision, createdAt, updatedAt, entryCount, printCount } = record;
  return { id, title, revision, createdAt, updatedAt, entryCount, printCount };
}

export function createProjectRepository(name = "sdms-print-studio") {
  let connection: Promise<IDBPDatabase<StudioDatabase>> | undefined;
  function database() {
    connection ??= openDB<StudioDatabase>(name, 1, {
      upgrade(db) {
        db.createObjectStore("projects", { keyPath: "id" });
        db.createObjectStore("assets", { keyPath: "id" });
        db.createObjectStore("preferences", { keyPath: "key" });
        const packages = db.createObjectStore("packages", { keyPath: "id" });
        packages.createIndex("nameKey", "nameKey", { unique: true });
      },
    }).catch((error) => {
      connection = undefined;
      throw error;
    });
    return connection;
  }

  return {
    async listProjects() {
      const db = await database();
      return (await db.getAll("projects")).map(summary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async lastProjectId() {
      const db = await database();
      return (await db.get("preferences", "lastProject"))?.value;
    },
    async activateProject(id: string) {
      const db = await database();
      await db.put("preferences", { key: "lastProject", value: id });
    },
    async loadProject(id: string) {
      const db = await database();
      const tx = db.transaction(["projects", "assets"], "readonly");
      const saved = await tx.objectStore("projects").get(id);
      if (!saved) return;
      const job = validateStudioJob(saved.job);
      const ids = [...new Set(job.entries.map((entry) => entry.assetId))];
      const assets = await Promise.all(ids.map((id) => tx.objectStore("assets").get(id)));
      await tx.done;
      const sources = assets.map(validateAsset);
      const originals = [...new Set(sources.flatMap((source) => source.originalId ? [source.originalId] : []))];
      // Open a new read transaction: the first one completed before validation.
      const originalSources = await Promise.all(originals.filter((id) => !ids.includes(id)).map((id) => db.get("assets", id)));
      sources.push(...originalSources.map(validateAsset));
      const sourceMap = new Map(sources.map((source) => [source.id, source]));
      assetDependencies(ids, sourceMap);
      if (job.entries.some((entry) => {
        const source = sourceMap.get(entry.assetId);
        return !source || source.width !== entry.width || source.height !== entry.height;
      })) throw new Error("A saved photo has inconsistent dimensions.");
      return { ...summary(saved), job, assets: sources };
    },
    async saveProject(id: string, revision: number, input: StudioJob, sources: ReadonlyMap<string, StudioAsset>) {
      const job = validateStudioJob(input);
      const ids = [...assetDependencies(job.entries.map((entry) => entry.assetId), sources)];
      const assets = ids.map((assetId) => validateAsset(sources.get(assetId)));
      if (job.entries.some((entry) => {
        const source = sources.get(entry.assetId);
        return !source || source.id !== entry.assetId || source.width !== entry.width || source.height !== entry.height;
      })) throw new Error("A photo has inconsistent source data.");
      const db = await database();
      const tx = db.transaction(["projects", "assets", "preferences"], "readwrite");
      try {
        const current = await tx.objectStore("projects").get(id);
        if ((current?.revision ?? 0) !== revision) {
          throw new Error("This project changed in another tab. Use Save copy to keep your edits.");
        }
        await Promise.all(assets.map(async (asset) => {
          if (await tx.objectStore("assets").getKey(asset.id) !== undefined) return;
          const { id, width, height, mime, blob, thumbnail, originalId, backgroundMask, backgroundColor } = asset;
          await tx.objectStore("assets").put({ id, width, height, mime, blob, thumbnail, ...(originalId ? { originalId, backgroundMask, backgroundColor } : {}) });
        }));
        const now = new Date().toISOString();
        const saved: ProjectRecord = {
          id, revision: revision + 1, title: job.title.trim() || "Untitled print job",
          createdAt: current?.createdAt ?? now, updatedAt: now,
          entryCount: job.entries.length,
          printCount: job.entries.reduce((count, entry) => count + (Number.isSafeInteger(entry.copies) && entry.copies > 0 ? entry.copies : 0), 0),
          job,
        };
        await tx.objectStore("projects").put(saved);
        await tx.objectStore("preferences").put({ key: "lastProject", value: id });
        await tx.done;
        return summary(saved);
      } catch (error) {
        try { tx.abort(); } catch { /* The failed request may have already aborted. */ }
        await tx.done.catch(() => undefined);
        throw error;
      }
    },
    async listPackages() {
      const db = await database();
      return (await db.getAll("packages")).map((value) => {
        const { id, name, items } = validateIdPackage(value);
        return { id, name, items };
      });
    },
    async savePackage(input: IdPackage) {
      const definition = validateIdPackage(input);
      const db = await database();
      try {
        await db.add("packages", { ...definition, nameKey: definition.name.trim().toLocaleLowerCase("en") });
      } catch (error) {
        if (error instanceof DOMException && error.name === "ConstraintError") {
          throw new Error("A package with this name already exists. Use a different name.");
        }
        throw error;
      }
    },
    async deletePackage(id: string) {
      if (builtinIdPackages.some((definition) => definition.id === id)) {
        throw new Error("Built-in ID packages cannot be deleted.");
      }
      const db = await database();
      await db.delete("packages", id);
    },
    async close() {
      (await connection)?.close();
      connection = undefined;
    },
  };
}

export const projectRepository = createProjectRepository();
