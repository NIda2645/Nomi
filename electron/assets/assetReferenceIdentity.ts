import fs from "node:fs";
import crypto from "node:crypto";

export function assetIdentityOf(asset: { data: { absolutePath?: unknown } }): Readonly<{ contentHash: string; version: 1 }> | undefined {
  const absolutePath = asset.data.absolutePath;
  if (typeof absolutePath !== "string" || !fs.existsSync(absolutePath)) return undefined;
  return Object.freeze({
    contentHash: crypto.createHash("sha256").update(fs.readFileSync(absolutePath)).digest("hex"),
    version: 1 as const,
  });
}


/** Traverse existing pages without materializing another index. A broken cursor fails closed. */
export function* iterateProjectAssets<T>(readPage: (cursor: string | null) => { items: T[]; cursor: string | null }): Generator<T> {
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const page = readPage(cursor);
    yield* page.items;
    cursor = page.cursor;
    if (cursor && seen.has(cursor)) throw new Error("project_asset_cursor_stalled");
    if (cursor) seen.add(cursor);
  } while (cursor);
}

export function findProjectAssetById<T extends { id: string }>(assetId: string, readPage: (cursor: string | null) => { items: T[]; cursor: string | null }): T | undefined {
  for (const asset of iterateProjectAssets(readPage)) if (asset.id === assetId) return asset;
  return undefined;
}
