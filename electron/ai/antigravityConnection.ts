import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import type { AntigravityConnectionStatus } from "../shared/antigravity";
import { buildAntigravityEnv, resolveAntigravityBin, runAntigravityProcess } from "./antigravityProcess";
import type { AntigravityResult } from "./antigravityProtocol";

const exec = promisify(execFile);
type Dependencies = {
  probe: (signal?: AbortSignal) => Promise<string>;
  run: (signal: AbortSignal) => Promise<AntigravityResult>;
  bin: () => string;
};

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

async function probe(signal?: AbortSignal): Promise<string> {
  const bin = resolveAntigravityBin();
  const options = { cwd: os.tmpdir(), env: await antigravityEnvironment(), timeout: 15_000,
    maxBuffer: 131_072, windowsHide: true, signal };
  try {
    const versionResult = await exec(bin, ["--version"], options);
    const version = versionResult.stdout.match(/\b\d+\.\d+\.\d+\b/)?.[0];
    if (!version) throw new Error("ANTIGRAVITY_VERSION_UNRECOGNIZED");
    if (process.platform === "win32") throw new Error("ANTIGRAVITY_PLATFORM_UNVERIFIED");
    await exec(bin, ["models"], options);
    return version;
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
  constructor(private readonly deps: Dependencies) {}

  private state(state: AntigravityConnectionStatus["state"], code?: string, version?: string): AntigravityConnectionStatus {
    const bin = this.deps.bin();
    // A copyable command, not a shell invocation. CLI login is interactive bare agy.
    const quoted = "'" + bin.replace(/'/g, "'\\''") + "'";
    return { state, ...(code ? { code } : {}), ...(version ? { version } : {}), checkedAt: Date.now(),
      loginCommand: process.platform === "win32" ? '& "' + bin.replace(/"/g, '""') + '"' : quoted,
      models: [{ id: "auto", label: "Antigravity CLI" }] };
  }
  private error(error: unknown): AntigravityConnectionStatus {
    const code = error instanceof Error && error.message.startsWith("ANTIGRAVITY_") ? error.message : "ANTIGRAVITY_TEST_FAILED";
    const state = code.includes("NOT_INSTALLED") ? "missing" : code.includes("LOGIN_REQUIRED") ? "login-required"
      : /ISOLATION|INIT_TIMEOUT|TOOLS_UNSUPPORTED|PLATFORM_UNVERIFIED/.test(code) ? "limited" : "error";
    return this.state(state, code);
  }
  canEnable(): boolean { return Boolean(this.verified && Date.now() - this.verified.at < 600_000); }

  async status(): Promise<AntigravityConnectionStatus> {
    const revision = this.revision;
    try {
      const version = await this.deps.probe();
      const ready = revision === this.revision && this.canEnable() && this.verified?.version === version;
      if (revision === this.revision && this.verified?.version !== version) this.verified = undefined;
      return this.state(ready ? "ready" : "unverified", undefined, version);
    } catch (error) {
      if (revision === this.revision) this.verified = undefined;
      return this.error(error);
    }
  }

  async test(): Promise<AntigravityConnectionStatus> {
    if (this.active) return this.state("unverified", "ANTIGRAVITY_TEST_ACTIVE");
    const controller = new AbortController(); this.active = controller;
    const revision = ++this.revision; this.verified = undefined;
    try {
      const version = await this.deps.probe(controller.signal);
      if (controller.signal.aborted) return this.state("unverified", "ANTIGRAVITY_CANCELLED");
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
  probe, bin: resolveAntigravityBin,
  run: async (signal) => runAntigravityProcess({ prompt: "Reply with exactly OK.", signal },
    { env: await antigravityEnvironment() }),
});
