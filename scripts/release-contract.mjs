import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const PUBLISHABLE_EXTENSIONS = new Set([".dmg", ".zip", ".exe", ".blockmap", ".yml"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listFiles(root) {
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(target);
      else files.push(target);
    }
  };
  visit(root);
  return files;
}

function copyUniqueByBasename(files, outputDir) {
  const copied = new Map();
  for (const source of files) {
    const basename = path.basename(source);
    if (!PUBLISHABLE_EXTENSIONS.has(path.extname(basename)) || /^builder-/.test(basename)) continue;
    const existing = copied.get(basename);
    if (existing) {
      const same = fs.readFileSync(existing).equals(fs.readFileSync(source));
      if (!same) throw new Error(`Conflicting release assets share the name ${basename}`);
      continue;
    }
    const destination = path.join(outputDir, basename);
    fs.copyFileSync(source, destination);
    copied.set(basename, destination);
  }
  return copied;
}

function requireAsset(copied, basename) {
  const filePath = copied.get(basename);
  if (!filePath) throw new Error(`Required release asset is missing: ${basename}`);
  return filePath;
}

function requireSingleInstaller(copied) {
  const installers = [...copied.entries()].filter(([basename]) => basename.endsWith(".exe"));
  if (installers.length !== 1) {
    throw new Error(`Expected exactly one Windows installer, found ${installers.map(([name]) => name).join(", ") || "none"}`);
  }
  return installers[0][1];
}

function writeAlias(source, outputDir, basename) {
  const destination = path.join(outputDir, basename);
  if (path.resolve(source) === path.resolve(destination)) return destination;
  fs.copyFileSync(source, destination);
  return destination;
}

export function assertReleaseVersion(version, packageVersion) {
  const normalized = String(version || "").replace(/^v/, "");
  if (!SEMVER.test(normalized)) throw new Error(`Release version must be SemVer, got ${JSON.stringify(version)}`);
  if (normalized !== packageVersion) {
    throw new Error(`Release version ${normalized} does not match package.json ${packageVersion}`);
  }
  return normalized;
}

export function createReleaseManifest({ repository, sha, version, runId, createdAt = new Date().toISOString() }) {
  if (!repository || !/^[0-9a-f]{40}$/i.test(sha)) throw new Error("Manifest requires a repository and full commit SHA");
  const normalizedVersion = assertReleaseVersion(version, version);
  return { schemaVersion: 1, repository, sha: sha.toLowerCase(), version: normalizedVersion, runId: String(runId), createdAt };
}

export function validateReleaseManifest(manifest, { repository, tag, runId }) {
  if (manifest?.schemaVersion !== 1) throw new Error("Unsupported release manifest schema");
  if (manifest.repository !== repository) throw new Error(`RC repository mismatch: ${manifest.repository}`);
  if (!/^[0-9a-f]{40}$/i.test(manifest.sha || "")) throw new Error("RC manifest has no valid commit SHA");
  if (runId !== undefined && String(manifest.runId) !== String(runId)) throw new Error(`RC run mismatch: ${manifest.runId}`);
  assertReleaseVersion(tag, manifest.version);
  return manifest;
}

export function prepareReleaseAssets(inputRoot, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const copied = copyUniqueByBasename(listFiles(inputRoot), outputDir);

  const macArmDmg = requireAsset(copied, "Nomi-mac-arm64.dmg");
  const macIntelDmg = requireAsset(copied, "Nomi-mac-x64.dmg");
  requireAsset(copied, "Nomi-mac-arm64.zip");
  requireAsset(copied, "Nomi-mac-x64.zip");
  requireAsset(copied, "latest-mac.yml");
  requireAsset(copied, "latest.yml");
  const windowsInstaller = requireSingleInstaller(copied);

  writeAlias(macArmDmg, outputDir, "Nomi-mac-arm64.dmg");
  writeAlias(macIntelDmg, outputDir, "Nomi-mac-intel.dmg");
  writeAlias(windowsInstaller, outputDir, "Nomi-windows-setup.exe");

  const publishFiles = fs.readdirSync(outputDir).filter((name) => name !== "SHA256SUMS.txt").sort();
  const checksums = publishFiles.map((name) => {
    const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(outputDir, name))).digest("hex");
    return `${digest}  ${name}`;
  });
  fs.writeFileSync(path.join(outputDir, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`);
  return [...publishFiles, "SHA256SUMS.txt"];
}

function packageVersion(root) {
  return readJson(path.join(root, "package.json")).version;
}

function argument(name, args) {
  const index = args.indexOf(`--${name}`);
  if (index < 0 || !args[index + 1]) throw new Error(`Missing --${name}`);
  return args[index + 1];
}

async function main(args) {
  const command = args.shift();
  if (command === "validate-version") {
    const root = path.resolve(argument("root", args));
    console.log(assertReleaseVersion(argument("version", args), packageVersion(root)));
    return;
  }
  if (command === "write-manifest") {
    const output = path.resolve(argument("output", args));
    const manifest = createReleaseManifest({
      repository: argument("repository", args),
      sha: argument("sha", args),
      version: argument("version", args).replace(/^v/, ""),
      runId: argument("run-id", args),
    });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }
  if (command === "validate-manifest") {
    const manifest = validateReleaseManifest(readJson(path.resolve(argument("manifest", args))), {
      repository: argument("repository", args),
      tag: argument("tag", args),
      runId: argument("run-id", args),
    });
    process.stdout.write(`${manifest.sha}\n`);
    return;
  }
  if (command === "prepare-assets") {
    const files = prepareReleaseAssets(path.resolve(argument("input", args)), path.resolve(argument("output", args)));
    console.log(`Prepared ${files.length} release assets`);
    return;
  }
  throw new Error(`Unknown release-contract command: ${command || "<empty>"}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
