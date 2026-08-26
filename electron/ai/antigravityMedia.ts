import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AntigravityCapability } from "../shared/antigravity";
import type { AntigravityResult, AntigravityToolStep } from "./antigravityProtocol";
import { antigravityHookCommand, antigravityHookSource, antigravityImageDigest, type AntigravityMediaPolicy } from "./antigravityMediaHook";
import { readAntigravityFile, recoverAntigravityArtifact, validateAntigravityImage } from "./antigravityArtifacts";

export type AntigravityImageInput = { bytes: Uint8Array; mimeType: string };
type AntigravityImageMetadata = { mimeType: string; extension: string; width: number; height: number };
const preparedImageMetadata = new WeakMap<AntigravityImageInput, AntigravityImageMetadata>();
export type AntigravityMediaContext = { policy: AntigravityMediaPolicy; plugin: string; system: string; tools: string[];
  snapshots: Array<{ bytes: Buffer; path: string }>; handshake: string };

/** Snapshot and fully decode once before spend; the validation mark never leaves main-process memory. */
export async function prepareAntigravityImageInput(input: AntigravityImageInput,
  signal?: AbortSignal): Promise<AntigravityImageInput> {
  const prepared = { bytes: Buffer.from(input.bytes), mimeType: input.mimeType };
  preparedImageMetadata.set(prepared, await validateAntigravityImage(prepared.bytes, prepared.mimeType, signal));
  return prepared;
}

export function assertAntigravityMediaInput(capability: AntigravityCapability, images: AntigravityImageInput[], version?: string): void {
  if (!["text", "vision", "image", "edit"].includes(capability)) throw new Error("ANTIGRAVITY_INVALID_CAPABILITY");
  if (capability !== "text" && version !== "1.1.21") throw new Error("ANTIGRAVITY_MEDIA_VERSION_UNVERIFIED");
  if (!Array.isArray(images) || images.length > 4 || ((capability === "vision" || capability === "edit") ? !images.length : images.length > 0)
    || images.some((image) => !(image?.bytes instanceof Uint8Array) || typeof image.mimeType !== "string")
    || images.reduce((sum, image) => sum + image.bytes.byteLength, 0) > 40 * 1024 * 1024) {
    throw new Error("ANTIGRAVITY_INVALID_IMAGES");
  }
}

export async function prepareAntigravityMedia(cwd: string, capability: Exclude<AntigravityCapability, "text">,
  images: AntigravityImageInput[], signal?: AbortSignal): Promise<AntigravityMediaContext> {
  const snapshots: Array<{ bytes: Buffer; mimeType: string; metadata: AntigravityImageMetadata }> = [];
  for (const image of images) {
    const prepared = preparedImageMetadata.get(image); preparedImageMetadata.delete(image);
    snapshots.push({ bytes: Buffer.from(image.bytes), mimeType: image.mimeType,
      metadata: prepared ?? await validateAntigravityImage(image.bytes, image.mimeType, signal) });
  }
  const plugin = path.join(cwd, "task-gate");
  await mkdir(plugin, { mode: 0o700 });
  await mkdir(path.join(cwd, "inputs"), { mode: 0o700 });
  const policy: AntigravityMediaPolicy = { capability, cwd, nonce: randomUUID(),
    imageName: "nomi_image_" + randomUUID().replace(/-/g, ""), images: [] };
  const staged: AntigravityMediaContext["snapshots"] = [];
  for (const [index, image] of snapshots.entries()) {
    const metadata = image.metadata;
    const absolute = path.join(cwd, "inputs", `reference-${index}.${metadata.extension}`);
    staged.push({ path: absolute, bytes: image.bytes });
    policy.images.push({ path: absolute, sha256: antigravityImageDigest(image.bytes) });
  }
  await writeFile(path.join(plugin, "plugin.json"), JSON.stringify({ name: "nomi-task-gate", description: "Nomi task image scope" }), { mode: 0o600 });
  const script = path.join(plugin, "gate.cjs");
  await writeFile(script, antigravityHookSource(policy), { mode: 0o400 });
  const command = antigravityHookCommand(process.execPath, script);
  await writeFile(path.join(plugin, "hooks.json"), JSON.stringify({ "nomi-task-gate": {
    PreInvocation: [{ type: "command", command: command + " init", timeout: 3 }],
    PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: command + " tool", timeout: 3 }] }],
  } }), { mode: 0o600 });
  const references = JSON.stringify(policy.images.map((image) => image.path));
  const handshake = "NOMI_READY_" + randomUUID().replace(/-/g, "");
  const system = [
    "Before the task, if the user message is exactly " + handshake + ", reply with exactly that text, without tools. The files do not exist yet. This instruction takes priority over the task instructions below.",
    "Complete only the requested task. Never run commands, browse, delegate, or use other tools.",
    "If a tool fails or is denied, stop. Do not retry or work around the denial.",
    capability === "vision"
      ? "Inspect each of these images exactly once with view_file AbsolutePath, then answer: " + references
      : "Call generate_image exactly once. Set ImageName to " + policy.imageName + ". Set ImagePaths exactly to " + references + ". Return a short description after success.",
  ].join("\n");
  return { policy, plugin, system, snapshots: staged, handshake, tools: [capability === "vision" ? "view_file" : "generate_image"] };
}

export async function stageAntigravityMedia(context: AntigravityMediaContext): Promise<void> {
  await verifyAntigravityHook(context);
  for (const image of context.snapshots) await writeFile(image.path, image.bytes, { mode: 0o400, flag: "wx" });
  context.snapshots = [];
  await writeFile(path.join(context.plugin, "ready.json"), JSON.stringify({ nonce: context.policy.nonce }), { mode: 0o400, flag: "wx" });
}

export async function verifyAntigravityHook(context: AntigravityMediaContext): Promise<void> {
  try {
    const marker = JSON.parse((await readAntigravityFile(context.policy.cwd, "task-gate/initialized.json", 1024)).toString("utf8"));
    if (marker.nonce !== context.policy.nonce) throw new Error();
  } catch { throw new Error("ANTIGRAVITY_HOOK_UNVERIFIED"); }
}

export async function finishAntigravityMedia(context: AntigravityMediaContext, result: AntigravityResult,
  toolSteps: AntigravityToolStep[], home: string, signal?: AbortSignal): Promise<AntigravityResult> {
  await verifyAntigravityHook(context);
  const { policy } = context;
  try {
    const count = policy.capability === "vision" ? policy.images.length : 1;
    if (toolSteps.length !== count) throw new Error();
    for (let index = 0; index < count; index++) {
      const ledger = JSON.parse((await readAntigravityFile(policy.cwd, `task-gate/authorized-${index}.json`, 131072)).toString("utf8"));
      if (ledger.nonce !== policy.nonce || ledger.name !== context.tools[0]) throw new Error();
      if (policy.capability === "vision") {
        if (ledger.args?.AbsolutePath !== policy.images[index].path) throw new Error();
      } else if (ledger.args?.ImageName !== policy.imageName
        || JSON.stringify(ledger.args.ImagePaths ?? []) !== JSON.stringify(policy.images.map((image) => image.path))) throw new Error();
    }
  } catch { throw new Error("ANTIGRAVITY_HOOK_UNVERIFIED"); }
  if (policy.capability === "vision") return result;
  const artifact = await recoverAntigravityArtifact({ home, conversationId: result.conversationId,
    imageName: policy.imageName, imagePaths: policy.images.map((image) => image.path), toolSteps, signal });
  return { ...result, artifacts: [artifact] };
}
