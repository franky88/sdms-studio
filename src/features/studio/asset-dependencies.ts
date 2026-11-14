import type { StudioAsset } from "./job";

export function assetDependencies(ids: Iterable<string>, assets: ReadonlyMap<string, StudioAsset>) {
  const all = new Set(ids);
  for (const id of all) {
    const source = assets.get(id);
    if (!source) throw new Error("An original photo is missing from this project.");
    if (source.id !== id) throw new Error("A photo has inconsistent source data.");
    if (source.originalId) {
      const original = assets.get(source.originalId);
      if (!original || original.originalId || original.width !== source.width || original.height !== source.height || source.originalId === id) throw new Error("A background edit has an invalid original photo.");
      all.add(source.originalId);
    }
  }
  return all;
}
