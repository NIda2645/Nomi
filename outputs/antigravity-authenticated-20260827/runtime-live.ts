import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { runAntigravityProcess, buildAntigravityEnv } from "../../electron/ai/antigravityProcess";
import { verifyAntigravityCapability } from "../../electron/ai/antigravityVerification";
import type { AntigravityCapability } from "../../electron/shared/antigravity";
async function main() {
const root = path.join(process.cwd(), "outputs/antigravity-authenticated-20260827");
const capability = process.argv[2] as AntigravityCapability;
if (!["text", "vision", "image", "edit"].includes(capability)) throw new Error("capability required");
const started = Date.now();
const env = { ...buildAntigravityEnv(), HTTPS_PROXY: "http://127.0.0.1:7897", HTTP_PROXY: "http://127.0.0.1:7897", NO_PROXY: "localhost,127.0.0.1,::1" };
await mkdir(root, { recursive: true });
try {
  const result = await verifyAntigravityCapability({ capability, modelId: "auto" }, "1.1.21", new AbortController().signal,
    (input) => runAntigravityProcess(input, { env, invocation: { command: process.execPath,
      args: [path.join(root, "observe-cli.mjs"), path.join(root, `runtime-${capability}-events.jsonl`)] } }));
  for (const [index, artifact] of (result.artifacts ?? []).entries()) await writeFile(path.join(root, `runtime-${capability}-${index}.${artifact.mimeType === "image/jpeg" ? "jpg" : "png"}`), artifact.bytes);
  await writeFile(path.join(root, `runtime-${capability}.json`), JSON.stringify({ capability, passed: true, elapsedMs: Date.now() - started,
    text: result.text, usage: result.usage, conversationId: result.conversationId,
    artifacts: result.artifacts?.map(({ bytes, ...artifact }) => ({ ...artifact, byteLength: bytes.length })) }, null, 2));
  process.stdout.write(`${capability}: PASS ${Date.now() - started}ms\n`);
} catch (error) {
  const code = error instanceof Error ? error.message : String(error);
  await writeFile(path.join(root, `runtime-${capability}.json`), JSON.stringify({ capability, passed: false, code, elapsedMs: Date.now() - started }, null, 2));
  process.stdout.write(`${capability}: FAIL ${code}\n`); process.exitCode = 1;
}

}
void main();
