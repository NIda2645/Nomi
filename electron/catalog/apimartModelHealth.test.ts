import { describe, expect, it } from "vitest";
import { APIMART_IMAGE_QUERY_OP, APIMART_STATUS_MAPPING } from "./apimartVendor";
import { buildApimartHealthInventory, buildApimartRecordingStatus, contractFingerprint, stableSerialize } from "./apimartModelHealth";
import { firstMappedString, providerMetaFromResponse, resolveTaskStatus } from "../tasks/responseParsing";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIXTURE_DIR = resolve(process.cwd(), "tests/fixtures/apimart-model-health");
const fixture = (relative: string) => JSON.parse(readFileSync(resolve(FIXTURE_DIR, relative), "utf8")) as { raw: unknown; contractFingerprint?: string };

describe("APIMart model health inventory", () => {
  it("derives every generation model × mode from catalog, without a count constant", () => {
    const entries = buildApimartHealthInventory();
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries.map((entry) => entry.kind))).toEqual(new Set(["image", "video", "audio"]));
    expect(entries.some((entry) => entry.modelKey === "nomi-audio")).toBe(false);
    expect(entries.some((entry) => entry.modelKey === "gpt-4o-mini-tts")).toBe(true);
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

  it("changes the fingerprint when any create body value changes", () => {
    const entry = buildApimartHealthInventory()[0]!;
    const changed = structuredClone(entry.contract) as typeof entry.contract;
    const body = changed.create && typeof changed.create === "object" && "body" in changed.create ? (changed.create as { body?: Record<string, unknown> }).body : null;
    expect(body).toBeTruthy();
    body!.prompt = "{{request.prompt.changed}}";
    expect(contractFingerprint(entry.contract)).not.toBe(contractFingerprint(changed));
  });

  it("replays both real array recordings", () => {
    expect(fixture("recordings/seedream-5-0-pro-array.json").raw).toMatchObject({ data: { result: { images: [{ url: ["https://cdn.example.com/apimart-result-seedream-5-0-pro.jpg"] }] } } });
    expect(fixture("recordings/nano-banana-2-array.json").raw).toMatchObject({ data: { result: { images: [{ url: ["https://cdn.example.com/apimart-result-nano-banana-2.jpg"] }] } } });
    for (const name of ["recordings/seedream-5-0-pro-array.json", "recordings/nano-banana-2-array.json"]) {
      const raw = fixture(name).raw;
      const url = firstMappedString(raw, APIMART_IMAGE_QUERY_OP.response_mapping ?? null, "image_url");
      expect(url).toMatch(/^https:\/\/cdn\.example\.com\/apimart-result-/);
      expect(resolveTaskStatus(raw, APIMART_IMAGE_QUERY_OP.response_mapping ?? null, APIMART_STATUS_MAPPING, [url]).status).toBe("succeeded");
      expect(providerMetaFromResponse(raw, APIMART_IMAGE_QUERY_OP.response_mapping ?? null).task_id).toMatch(/^task_fixture_/);
    }
  });

  it("still reads the scalar result URL shape that v0.22.4 fixed (derived from a real recording)", () => {
    // No scalar-shaped response has been recorded yet; derive it from the real array
    // recording so every other field keeps its real shape. Not counted as a recording.
    const scalar = structuredClone(fixture("recordings/nano-banana-2-array.json").raw) as { data: { result: { images: { url: unknown }[] } } };
    const image = scalar.data.result.images[0]!;
    image.url = (image.url as string[])[0];
    expect(firstMappedString(scalar, APIMART_IMAGE_QUERY_OP.response_mapping ?? null, "image_url")).toBe("https://cdn.example.com/apimart-result-nano-banana-2.jpg");
  });

  it("derives recorded, stale, and pending-L3 statuses for all inventory entries", () => {
    const entries = buildApimartHealthInventory();
    const statuses = buildApimartRecordingStatus(entries, [
      { modelKey: entries[0]!.modelKey, modeId: entries[0]!.modeId, taskKind: entries[0]!.taskKind, contractFingerprint: entries[0]!.contractFingerprint },
      { modelKey: entries[1]!.modelKey, modeId: entries[1]!.modeId, taskKind: entries[1]!.taskKind, contractFingerprint: "stale" },
    ]);
    expect(statuses.filter((row) => row.status === "recorded")).toHaveLength(1);
    expect(statuses.filter((row) => row.status === "recorded-stale")).toHaveLength(1);
    expect(statuses.filter((row) => row.status === "pending-L3")).toHaveLength(entries.length - 2);
  });
});
