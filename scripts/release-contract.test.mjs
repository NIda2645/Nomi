import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertReleaseVersion,
  createReleaseManifest,
  prepareReleaseAssets,
  validateReleaseManifest,
} from "./release-contract.mjs";

const roots = [];
const makeRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-release-contract-"));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("release contract", () => {
  it("requires the requested version to match package.json", () => {
    expect(assertReleaseVersion("v0.20.0", "0.20.0")).toBe("0.20.0");
    expect(() => assertReleaseVersion("v0.20.1", "0.20.0")).toThrow(/does not match/);
  });

  it("binds promotion to the repository, tag, and immutable commit", () => {
    const manifest = createReleaseManifest({
      repository: "aqm857886159/Nomi",
      sha: "a".repeat(40),
      version: "0.20.0",
      runId: "123",
      createdAt: "2026-08-16T00:00:00.000Z",
    });
    expect(validateReleaseManifest(manifest, { repository: "aqm857886159/Nomi", tag: "v0.20.0", runId: "123" }).sha).toBe("a".repeat(40));
    expect(() => validateReleaseManifest(manifest, { repository: "other/Nomi", tag: "v0.20.0" })).toThrow(/repository mismatch/);
    expect(() => validateReleaseManifest(manifest, { repository: "aqm857886159/Nomi", tag: "v0.20.0", runId: "456" })).toThrow(/run mismatch/);
  });

  it("requires all platform assets and writes stable aliases plus checksums", () => {
    const root = makeRoot();
    const input = path.join(root, "input");
    const output = path.join(root, "output");
    fs.mkdirSync(input, { recursive: true });
    for (const name of [
      "Nomi-mac-arm64.dmg",
      "Nomi-mac-x64.dmg",
      "Nomi-mac-arm64.zip",
      "Nomi-mac-x64.zip",
      "latest-mac.yml",
      "Nomi-win-x64.exe",
      "latest.yml",
    ]) fs.writeFileSync(path.join(input, name), name);

    prepareReleaseAssets(input, output);

    expect(fs.readFileSync(path.join(output, "Nomi-mac-intel.dmg"), "utf8")).toBe("Nomi-mac-x64.dmg");
    expect(fs.readFileSync(path.join(output, "Nomi-windows-setup.exe"), "utf8")).toBe("Nomi-win-x64.exe");
    expect(fs.readFileSync(path.join(output, "SHA256SUMS.txt"), "utf8")).toContain("Nomi-mac-arm64.dmg");
  });
});
