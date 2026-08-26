import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import { parseAntigravityTestRequest, type AntigravityCheck, type AntigravityTestRequest, type AntigravityConnectionStatus } from "../shared/antigravity";
import { buildAntigravityEnv, resolveAntigravityBin, runAntigravityProcess } from "./antigravityProcess";
import type { AntigravityResult } from "./antigravityProtocol";
import { verifyAntigravityCapability } from "./antigravityVerification";

const exec = promisify(execFile);
type Discovery = { version: string; models: AntigravityConnectionStatus["models"] };
type Dependencies = {
  probe: (signal?: AbortSignal) => Promise<Discovery>;
  run: (signal: AbortSignal, request: AntigravityTestRequest, version: string) => Promise<AntigravityResult>;
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
    if (failure.code === "ENOENT") throw Object.assign(new Error("ANTIGRAVITY_NOT_INSTALLED"), { cause: error });
    if (/please sign in|authentication required|not authenticated|login required/i.test(failure.stderr || "")) {
      throw Object.assign(new Error("ANTIGRAVITY_LOGIN_REQUIRED"), { cause: error });
    }
    if (failure.message.startsWith("ANTIGRAVITY_")) throw failure;
    throw Object.assign(new Error("ANTIGRAVITY_PROBE_FAILED"), { cause: error });
  }
}

export class AntigravityConnection {
  private active?: AbortController;
  private revision = 0;
  private version?: string;
  private checks: AntigravityCheck[] = [];
  private models: AntigravityConnectionStatus["models"] = [];
  constructor(private readonly deps: Dependencies) {}

  /** Main-only persistent evidence; never accept records through renderer IPC. */
  restore(values: unknown): void {
    if (this.revision || !Array.isArray(values)) return;
    for (const raw of values) {
      try {
        if (!raw || typeof raw !== "object") continue;
        const { capability, modelId, state, version, checkedAt, code } = raw;
        const request = parseAntigravityTestRequest({ capability, modelId });
        if (!["passed", "failed"].includes(state) || typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)
          || !Number.isSafeInteger(checkedAt) || checkedAt < 0 || checkedAt > Date.now()) continue;
        this.replaceCheck(request, { ...request, state, version, checkedAt,
          ...(typeof code === "string" && /^ANTIGRAVITY_[A-Z_]+$/.test(code) ? { code } : {}) });
      } catch { /* Invalid cached records never grant readiness. */ }
    }
  }

  private state(state: AntigravityConnectionStatus["state"], code?: string): AntigravityConnectionStatus {
    const bin = this.deps.bin();
    const quoted = "'" + bin.replace(/'/g, "'\\''") + "'";
    return { state, ...(code ? { code } : {}), ...(this.version ? { version: this.version } : {}), checkedAt: Date.now(),
      loginCommand: process.platform === "win32" ? '& "' + bin.replace(/"/g, '""') + '"' : quoted,
      models: this.models.map((model) => ({ ...model })), checks: this.checks.map((check) => ({ ...check })) };
  }
  private error(error: unknown): AntigravityConnectionStatus {
    const code = error instanceof Error && /^ANTIGRAVITY_[A-Z_]+$/.test(error.message) ? error.message : "ANTIGRAVITY_TEST_FAILED";
    const state = code.includes("NOT_INSTALLED") ? "missing" : code.includes("LOGIN_REQUIRED") ? "login-required"
      : /PROFILE_UNVERIFIED|INVALID_INIT|INIT_TIMEOUT|TOOLS_UNSUPPORTED|PLATFORM_UNVERIFIED|QUOTA/.test(code) ? "limited" : "error";
    return this.state(state, code);
  }
  private discovered(discovery: Discovery): void {
    if (this.version && this.version !== discovery.version) this.checks = [];
    this.checks = this.checks.filter((check) => check.version === discovery.version);
    this.version = discovery.version;
    this.models = discovery.models;
    this.checks = this.checks.filter((check) => check.modelId === "auto" || this.models.some((model) => model.id === check.modelId));
  }
  canEnable(request?: AntigravityTestRequest): boolean {
    return this.checks.some((check) => check.state === "passed" && check.version === this.version
      && Date.now() - check.checkedAt < 600_000
      && (!request || (check.capability === request.capability && check.modelId === request.modelId)));
  }
  /** Version-bound historical evidence. Unlike enable toggles, runtime/write authorization is not freshness-bound. */
  hasPassed(request: AntigravityTestRequest, version = this.version): boolean {
    return Boolean(version) && this.checks.some((check) => check.state === "passed" && check.version === version
      && check.capability === request.capability && check.modelId === request.modelId);
  }
  private replaceCheck(request: AntigravityTestRequest, check?: AntigravityCheck): void {
    this.checks = this.checks.filter((item) => item.capability !== request.capability || item.modelId !== request.modelId);
    if (check) this.checks.push(check);
  }

  async status(): Promise<AntigravityConnectionStatus> {
    if (this.active) return this.state("unverified", "ANTIGRAVITY_TEST_ACTIVE");
    const revision = ++this.revision;
    try {
      const discovery = await this.deps.probe();
      if (revision === this.revision) this.discovered(discovery);
      return this.state(this.canEnable() ? "ready" : "unverified");
    } catch (error) {
      if (revision !== this.revision) return this.state("unverified");
      this.checks = []; this.models = [];
      return this.error(error);
    }
  }

  async test(value?: AntigravityTestRequest): Promise<AntigravityConnectionStatus> {
    const request = parseAntigravityTestRequest(value);
    if (this.active) return this.state("unverified", "ANTIGRAVITY_TEST_ACTIVE");
    const controller = new AbortController(); this.active = controller;
    const revision = ++this.revision;
    this.replaceCheck(request);
    let discovered = false;
    try {
      const discovery = await this.deps.probe(controller.signal);
      if (controller.signal.aborted || revision !== this.revision) return this.state("unverified", "ANTIGRAVITY_CANCELLED");
      this.discovered(discovery); discovered = true;
      if (request.modelId !== "auto" && !this.models.some((model) => model.id === request.modelId)) {
        throw new Error("ANTIGRAVITY_MODEL_NOT_DISCOVERED");
      }
      const result = await this.deps.run(controller.signal, request, discovery.version);
      if (controller.signal.aborted || revision !== this.revision) return this.state("unverified", "ANTIGRAVITY_CANCELLED");
      if (request.capability === "text" && result.text.trim() !== "OK") throw new Error("ANTIGRAVITY_TEST_ASSERTION_FAILED");
      this.replaceCheck(request, { ...request, state: "passed", version: discovery.version, checkedAt: Date.now() });
      return this.state("ready");
    } catch (error) {
      if (controller.signal.aborted || revision !== this.revision) return this.state("unverified", "ANTIGRAVITY_CANCELLED");
      if (!discovered) { this.checks = []; this.models = []; }
      const status = this.error(error);
      if (discovered) this.replaceCheck(request, { ...request, state: "failed", version: this.version!, checkedAt: Date.now(), code: status.code });
      return this.error(error);
    } finally {
      if (this.active === controller) this.active = undefined;
    }
  }

  cancel(): void { this.revision++; this.active?.abort(); }
}

export const antigravityConnection = new AntigravityConnection({
  probe: probeAntigravity, bin: resolveAntigravityBin,
  run: (signal, request, version) => verifyAntigravityCapability(request, version, signal,
    async (input) => runAntigravityProcess(input, { env: await antigravityEnvironment() })),
});
