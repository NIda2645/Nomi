import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type { AntigravityConnectionStatus } from "../shared/antigravity";
import { buildAntigravityEnv, resolveAntigravityBin, runAntigravityProcess } from "./antigravityProcess";
import type { AntigravityResult } from "./antigravityProtocol";

const exec = promisify(execFile);
type Discovery = { version: string; models: AntigravityConnectionStatus["models"] };
type Dependencies = {
  probe: (signal?: AbortSignal) => Promise<Discovery>;
  run: (signal: AbortSignal) => Promise<AntigravityResult>;
  bin: () => string;
};

/** CLI 1.1.21 `agy models` emits ID<TAB>label, not JSON or capability metadata. */
export function parseAntigravityModels(stdout: string): AntigravityConnectionStatus["models"] {
  const seen = new Set<string>();
  return stdout.trim().split(/\r?\n/).map((line) => {
    const fields = line.split("\t");
    const [id, label] = fields;
    if (fields.length !== 2 || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(id)
      || !label?.trim() || label.length > 256 || /\p{C}/u.test(label) || seen.has(id)) {
      throw new Error("ANTIGRAVITY_MODELS_INVALID");
    }
    seen.add(id);
    return { id, label: label.trim() };
  });
}

export async function antigravityEnvironment(): Promise<NodeJS.ProcessEnv> {
  const [{ getProxyStatus }, { readProxyPrefs }] = await Promise.all([import("../systemProxy"), import("../proxySettings")]);
  const status = getProxyStatus(readProxyPrefs());
  const env = buildAntigravityEnv();
  // Apply Nomi's resolved preference, never silently inherit a different proxy.
  // CLI support for every Google endpoint is still subject to upstream behavior.
  if (status.activeUrl) {
    env.HTTPS_PROXY = status.activeUrl; env.HTTP_PROXY = status.activeUrl;
    env.NO_PROXY = "localhost,127.0.0.1,::1";
  }
  return env;
}

/** Invocation/env overrides are main-process test seams, never renderer input. */
export async function probeAntigravity(signal?: AbortSignal, overrides: {
  invocation?: { command: string; args: string[] }; env?: NodeJS.ProcessEnv;
} = {}): Promise<Discovery> {
  const bin = overrides.invocation?.command ?? resolveAntigravityBin();
  const prefix = overrides.invocation?.args ?? [];
  const options = { cwd: os.tmpdir(), env: overrides.env ?? await antigravityEnvironment(), timeout: 15_000,
    maxBuffer: 131_072, windowsHide: true, signal };
  try {
    const versionRun = exec(bin, [...prefix, "--version"], options);
    versionRun.child.stdin?.on("error", () => {}); // exec reports the authoritative process error/exit.
    versionRun.child.stdin?.end();
    const versionResult = await versionRun;
    const version = versionResult.stdout.match(/\b\d+\.\d+\.\d+\b/)?.[0];
    if (!version) throw new Error("ANTIGRAVITY_VERSION_UNRECOGNIZED");
    if (process.platform === "win32" && !overrides.invocation) throw new Error("ANTIGRAVITY_PLATFORM_UNVERIFIED");
    const modelRun = exec(bin, [...prefix, "models"], options);
    // Noninteractive discovery waits for EOF with Node's otherwise-open pipe.
    modelRun.child.stdin?.on("error", () => {});
    modelRun.child.stdin?.end();
    const modelResult = await modelRun;
    return { version, models: parseAntigravityModels(modelResult.stdout) };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string };
    if (failure.code === "ENOENT") throw new Error("ANTIGRAVITY_NOT_INSTALLED", { cause: error });
    if (/please sign in|authentication required|not authenticated|login required/i.test(failure.stderr || "")) {
      throw new Error("ANTIGRAVITY_LOGIN_REQUIRED", { cause: error });
    }
    if (failure.message.startsWith("ANTIGRAVITY_")) throw failure;
    throw new Error("ANTIGRAVITY_PROBE_FAILED", { cause: error });
  }
}

export class AntigravityConnection {
  private active?: AbortController;
  private verified?: { version: string; at: number };
  private revision = 0;
  private models: AntigravityConnectionStatus["models"] = [];
  constructor(private readonly deps: Dependencies) {}

  private state(state: AntigravityConnectionStatus["state"], code?: string, version?: string): AntigravityConnectionStatus {
    const bin = this.deps.bin();
    // A copyable command, not a shell invocation. CLI login is interactive bare agy.
    const quoted = "'" + bin.replace(/'/g, "'\\''") + "'";
    return { state, ...(code ? { code } : {}), ...(version ? { version } : {}), checkedAt: Date.now(),
      loginCommand: process.platform === "win32" ? '& "' + bin.replace(/"/g, '""') + '"' : quoted,
      models: this.models.length ? [{ id: "auto", label: "Antigravity CLI" }, ...this.models] : [] };
  }
  private error(error: unknown): AntigravityConnectionStatus {
    const code = error instanceof Error && error.message.startsWith("ANTIGRAVITY_") ? error.message : "ANTIGRAVITY_TEST_FAILED";
    const state = code.includes("NOT_INSTALLED") ? "missing" : code.includes("LOGIN_REQUIRED") ? "login-required"
      : /PROFILE_UNVERIFIED|INVALID_INIT|INIT_TIMEOUT|TOOLS_UNSUPPORTED|PLATFORM_UNVERIFIED/.test(code) ? "limited" : "error";
    return this.state(state, code);
  }
  canEnable(): boolean { return Boolean(this.verified && Date.now() - this.verified.at < 600_000); }

  async status(): Promise<AntigravityConnectionStatus> {
    const revision = this.revision;
    try {
      const { version, models } = await this.deps.probe();
      if (revision === this.revision) this.models = models;
      const ready = revision === this.revision && this.canEnable() && this.verified?.version === version;
      if (revision === this.revision && this.verified?.version !== version) this.verified = undefined;
      return this.state(ready ? "ready" : "unverified", undefined, version);
    } catch (error) {
      if (revision === this.revision) { this.verified = undefined; this.models = []; }
      return this.error(error);
    }
  }

  async test(): Promise<AntigravityConnectionStatus> {
    if (this.active) return this.state("unverified", "ANTIGRAVITY_TEST_ACTIVE");
    const controller = new AbortController(); this.active = controller;
    const revision = ++this.revision; this.verified = undefined; this.models = [];
    try {
      const { version, models } = await this.deps.probe(controller.signal);
      if (controller.signal.aborted) return this.state("unverified", "ANTIGRAVITY_CANCELLED");
      if (revision === this.revision) this.models = models;
      await this.deps.run(controller.signal);
      if (controller.signal.aborted || revision !== this.revision) return this.state("unverified", "ANTIGRAVITY_CANCELLED");
      this.verified = { version, at: Date.now() };
      return this.state("ready", undefined, version);
    } catch (error) {
      return controller.signal.aborted ? this.state("unverified", "ANTIGRAVITY_CANCELLED") : this.error(error);
    } finally {
      if (this.active === controller) this.active = undefined;
    }
  }

  cancel(): void { this.revision++; this.verified = undefined; this.active?.abort(); }
}

export const antigravityConnection = new AntigravityConnection({
  probe: probeAntigravity, bin: resolveAntigravityBin,
  run: async (signal) => runAntigravityProcess({ prompt: "Reply with exactly OK.", signal },
    { env: await antigravityEnvironment() }),
});
