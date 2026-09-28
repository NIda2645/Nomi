import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApimartHealthInventory } from "../electron/catalog/apimartModelHealth.ts";
import { collectApimart, associateCatalogDocs, offlineFileName, type RadarEntry } from "./model-radar.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APIMART_INDEX = "https://docs.apimart.ai/llms.txt";

function offlineFetcher(directory: string) {
  return async (url: string): Promise<string> => fs.readFileSync(path.join(directory, offlineFileName(url)), "utf8");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const index = args.indexOf("--offline");
  const offlineDir = index >= 0 ? args[index + 1] : "";
  const entries: RadarEntry[] = await collectApimart(offlineDir ? offlineFetcher(offlineDir) : async (url) => (await fetch(url)).text());
  const inventory = buildApimartHealthInventory();
  const docsByModel = associateCatalogDocs([...new Set(inventory.map((entry) => entry.modelKey))], entries);
  const docs = [...new Set(inventory.map((entry) => entry.modelKey))].map((modelKey) => ({
    modelKey,
    docs: (docsByModel.get(modelKey) ?? []).map(({ slug, title, url }) => ({ slug, title, url })),
  }));
  const unmatched = docs.filter((row) => row.docs.length === 0).map((row) => row.modelKey);
  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: offlineDir ? "offline" : "network",
    entries: inventory,
    documentation: docs,
    unmatchedDocumentation: unmatched,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(`APIMart health failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
