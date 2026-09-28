import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApimartHealthInventory, buildApimartRecordingStatus, type ApimartRecordingMetadata } from "../electron/catalog/apimartModelHealth.ts";
import { collectApimart, associateCatalogDocs, offlineFetcher, type RadarEntry } from "./model-radar.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RECORDING_DIR = path.join(ROOT, "tests/fixtures/apimart-model-health/recordings");

function readRecordings(): ApimartRecordingMetadata[] {
  if (!fs.existsSync(RECORDING_DIR)) return [];
  return fs.readdirSync(RECORDING_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => {
      const file = path.join(RECORDING_DIR, entry.name);
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as ApimartRecordingMetadata;
      return { ...parsed, path: path.relative(ROOT, file).replaceAll("\\", "/") };
    });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const index = args.indexOf("--offline");
  const offlineDir = index >= 0 ? args[index + 1] : "";
  const entries: RadarEntry[] = await collectApimart(offlineDir ? offlineFetcher(offlineDir) : async (url) => (await fetch(url)).text());
  const inventory = buildApimartHealthInventory();
  const recordingInventory = buildApimartRecordingStatus(inventory, readRecordings());
  const modelKeys = [...new Set(inventory.map((entry) => entry.modelKey))];
  const aliasesByModel = new Map(modelKeys.map((modelKey) => [modelKey, [...new Set(inventory.filter((entry) => entry.modelKey === modelKey).flatMap((entry) => entry.documentationKeys))]] as const));
  const docsByModel = associateCatalogDocs(modelKeys, entries, aliasesByModel);
  const docs = modelKeys.map((modelKey) => ({
    modelKey,
    docs: (docsByModel.get(modelKey) ?? []).map(({ slug, title, url }) => ({ slug, title, url })),
  }));
  const unmatched = docs.filter((row) => row.docs.length === 0).map((row) => row.modelKey);
  const recordingStats = {
    recorded: recordingInventory.filter((row) => row.status === "recorded").length,
    recordedStale: recordingInventory.filter((row) => row.status === "recorded-stale").length,
    pendingL3: recordingInventory.filter((row) => row.status === "pending-L3").length,
  };
  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: offlineDir ? "offline" : "network",
    entries: inventory,
    documentation: docs,
    unmatchedDocumentation: unmatched,
    recordingInventory,
    recordingStats,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(`APIMart health failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
