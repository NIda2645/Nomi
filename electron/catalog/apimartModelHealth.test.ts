import { describe, expect, it } from "vitest";
import { APIMART_IMAGE_QUERY_OP, APIMART_VIDEO_QUERY_OP } from "./apimartVendor";
import { buildApimartHealthInventory, contractFingerprint, stableSerialize } from "./apimartModelHealth";
import { firstMappedString, providerMetaFromResponse, resolveTaskStatus } from "../tasks/responseParsing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/apimart-model-health");
const fixture = (name: string) => JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), "utf8")) as { raw: unknown };

describe("APIMart model health inventory", () => {
  it("derives every generation model × mode from catalog, without a count constant", () => {
    const entries = buildApimartHealthInventory();
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries.map((entry) => entry.kind))).toEqual(new Set(["image", "video", "audio"]));
    expect(entries.every((entry) => entry.contractFingerprint.length === 64)).toBe(true);
    expect(entries.some((entry) => entry.taskKind === "text_to_audio")).toBe(true);
    expect(entries.some((entry) => entry.taskKind === "transcribe")).toBe(false);
  });

  it("keeps contract fingerprints independent of unrelated object key order", () => {
    const first = { create: { body: { model: "x", prompt: "y" }, path: "/v1" }, statusMapping: { queued: ["pending"] } };
    const reordered = { statusMapping: { queued: ["pending"] }, create: { path: "/v1", body: { prompt: "y", model: "x" } } };
    expect(stableSerialize(first)).toBe(stableSerialize(reordered));
    expect(contractFingerprint(first)).toBe(contractFingerprint(reordered));
  });

  it("replays both APIMart result URL shapes through the production mapping parser", () => {
    expect(APIMART_IMAGE_QUERY_OP.response_mapping?.image_url).toEqual(["data.result.images.0.url.0", "data.result.images.0.url"]);
    expect(APIMART_VIDEO_QUERY_OP.response_mapping?.video_url).toEqual(["data.result.videos.0.url.0", "data.result.videos.0.url"]);
    for (const name of ["seedream-5-0-pro-array.json", "nano-banana-2-string.json"]) {
      const raw = fixture(name).raw;
      expect(firstMappedString(raw, APIMART_IMAGE_QUERY_OP.response_mapping ?? null, "image_url")).toBe("https://cdn.example.com/apimart-result.asset");
      expect(resolveTaskStatus(raw, APIMART_IMAGE_QUERY_OP.response_mapping ?? null, { succeeded: ["completed"] }, ["https://cdn.example.com/apimart-result.asset"]).status).toBe("succeeded");
      expect(providerMetaFromResponse(raw, APIMART_IMAGE_QUERY_OP.response_mapping ?? null).task_id).toBe("task-fixture");
    }
  });
});
