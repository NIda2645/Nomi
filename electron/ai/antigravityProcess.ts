import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { AntigravityProtocol, type AntigravityResult } from "./antigravityProtocol";

type Invocation = { command: string; args: string[] };
type RunOptions = {
  prompt: string;
  model?: string;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
};
type ProcessOptions = {
  /** Main-process test seam, never supplied by the renderer. */
  invocation?: Invocation;
  initTimeoutMs?: number;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
};
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export function resolveAntigravityBin(): string {
  const name = process.platform === "win32" ? "agy.exe" : "agy";
  const candidates = [path.join(os.homedir(), ".local", "bin", name),
    ...(process.platform === "win32" ? [path.join(os.homedir(), "AppData", "Local", "agy", "bin", name)] : []),
    ...((process.env.PATH || "").split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, name)))];
  return candidates.find((candidate) => path.isAbsolute(candidate) && existsSync(candidate)) || name;
}

/** Preserve CLI login locations, not arbitrary app/API secrets. No token file reads. */
export function buildAntigravityEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allowed = ["HOME", "USERPROFILE", "PATH", "SystemRoot", "WINDIR", "APPDATA", "LOCALAPPDATA",
    "TMP", "TEMP", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TERM"];
  return Object.fromEntries(allowed.filter((key) => base[key] !== undefined).map((key) => [key, base[key]]));
}

function abortError(): Error { return Object.assign(new Error("ANTIGRAVITY_CANCELLED"), { name: "AbortError" }); }
function failureFromExit(stderr: string): Error {
  if (/please sign in|authentication required|not authenticated|login required|unauthorized/i.test(stderr)) {
    return new Error("ANTIGRAVITY_LOGIN_REQUIRED");
  }
  if (/quota|rate.?limit|resource.exhausted|too many requests/i.test(stderr)) return new Error("ANTIGRAVITY_QUOTA");
  return new Error("ANTIGRAVITY_PROCESS_FAILED");
}

export async function runAntigravityProcess(input: RunOptions, options: ProcessOptions = {}): Promise<AntigravityResult> {
  // Windows needs a Job Object to own descendants even after the CLI exits.
  // Do not advertise bounded cancellation there until that boundary exists.
  if (process.platform === "win32" && !options.invocation) throw new Error("ANTIGRAVITY_PLATFORM_UNVERIFIED");
  if (input.signal?.aborted) throw abortError();
  if (!input.prompt.trim()) throw new Error("ANTIGRAVITY_EMPTY_PROMPT");
  if (input.model && !/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/.test(input.model)) throw new Error("ANTIGRAVITY_INVALID_MODEL");
  const cwd = await realpath(await mkdtemp(path.join(os.tmpdir(), "nomi-antigravity-")));
  const agentName = "nomi-text-" + randomUUID();
  try {
    const agentDir = path.join(cwd, ".agents", "agents");
    await mkdir(agentDir, { recursive: true });
    await writeFile(path.join(agentDir, agentName + ".md"), [
      "---", "name: " + agentName, "description: Nomi text generation", "tools: []",
      "mainAgent: true", "subagent: false", "commandExecutionPolicy: off", "mcpServers: []",
      "skills: []", "plugins: []", "---",
      "Return only the requested text. Do not use tools or access files.",
    ].join("\n"), { mode: 0o600 });
    if (input.signal?.aborted) throw abortError();
    const invocation = options.invocation || { command: resolveAntigravityBin(), args: [] };
    const args = [...invocation.args, "--agent", agentName, "--input-format", "stream-json",
      "--output-format", "stream-json", "--disable-slash-commands", "--sandbox",
      "--print-timeout", "120s", ...(input.model && input.model !== "auto" ? ["--model", input.model] : [])];
    return await new Promise<AntigravityResult>((resolve, reject) => {
      const child = spawn(invocation.command, args, { cwd, env: options.env ?? buildAntigravityEnv(), shell: false,
        detached: process.platform !== "win32", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      let failure: Error | undefined;
      let closed = false;
      let buffer = "";
      let stderr = "";
      let bytes = 0;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      let drainTimer: ReturnType<typeof setTimeout> | undefined;
      const killOwnedGroup = (signal: NodeJS.Signals) => {
        if (!child.pid) return;
        try {
          if (process.platform !== "win32") process.kill(-child.pid, signal);
          else child.kill(signal); // Test fixture only; real Windows execution is gated above.
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill(signal);
        }
      };
      const cleanupOwnedGroup = async () => {
        // close only confirms the direct child's pipes closed, not its descendants.
        // On every terminal path kill the remaining group before deleting its cwd.
        killOwnedGroup("SIGKILL");
        if (process.platform === "win32" || !child.pid) return;
        const deadline = Date.now() + 1_000;
        while (true) {
          try { process.kill(-child.pid, 0); }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
            throw new Error("ANTIGRAVITY_CLEANUP_FAILED", { cause: error });
          }
          if (Date.now() >= deadline) throw new Error("ANTIGRAVITY_CLEANUP_TIMEOUT");
          await delay(20);
        }
      };
      const stop = (error: Error) => {
        if (failure) return;
        failure = error;
        if (closed) return;
        child.stdin.destroy();
        killOwnedGroup("SIGTERM");
        killTimer = setTimeout(() => { if (!closed) killOwnedGroup("SIGKILL"); }, 750);
        killTimer.unref();
      };
      const onAbort = () => stop(abortError());
      const initTimer = setTimeout(() => stop(new Error("ANTIGRAVITY_INIT_TIMEOUT")), options.initTimeoutMs ?? 10_000);
      const overallTimer = setTimeout(() => stop(new Error("ANTIGRAVITY_TIMEOUT")), options.timeoutMs ?? 125_000);
      const parser = new AntigravityProtocol(() => {
        clearTimeout(initTimer);
        if (!failure && !input.signal?.aborted) {
          // EOF ends the session after this single turn. No global --continue.
          child.stdin.end(JSON.stringify({ event: "user", message: { content: input.prompt } }) + "\n");
        }
      }, (delta) => input.onDelta?.(delta), {
        agent: agentName, cwd, ...(input.model && input.model !== "auto" ? { model: input.model } : {}),
      });
      const boundDrain = () => {
        drainTimer ??= setTimeout(() => stop(new Error("ANTIGRAVITY_DRAIN_TIMEOUT")), 2_000);
      };
      const acceptLine = (line: string) => {
        if (!line.trim() || failure) return;
        try { parser.accept(JSON.parse(line)); if (parser.completed) boundDrain(); }
        catch (error) { stop(error instanceof SyntaxError ? new Error("ANTIGRAVITY_INVALID_JSON") : error as Error); }
      };
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > MAX_OUTPUT_BYTES) { stop(new Error("ANTIGRAVITY_OUTPUT_LIMIT")); return; }
        buffer += chunk;
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); acceptLine(line);
        }
      });
      child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-65_536); });
      // EPIPE can race process exit; close/exit retains the authoritative error.
      child.stdin.on("error", () => {});
      child.on("error", (error: NodeJS.ErrnoException) => {
        failure ??= new Error(error.code === "ENOENT" ? "ANTIGRAVITY_NOT_INSTALLED" : "ANTIGRAVITY_PROCESS_FAILED");
      });
      child.on("exit", boundDrain);
      child.on("close", (code) => {
        closed = true;
        clearTimeout(initTimer); clearTimeout(overallTimer); if (killTimer) clearTimeout(killTimer);
        if (drainTimer) clearTimeout(drainTimer);
        input.signal?.removeEventListener("abort", onAbort);
        void cleanupOwnedGroup().then(() => {
          if (input.signal?.aborted) failure ??= abortError();
          if (failure) { reject(failure); return; }
          if (code !== 0) { reject(failureFromExit(stderr)); return; }
          acceptLine(buffer);
          if (failure) { reject(failure); return; }
          try { resolve(parser.finish()); } catch (error) { reject(error); }
        }, reject);
      });
      input.signal?.addEventListener("abort", onAbort, { once: true });
      if (input.signal?.aborted) onAbort();
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
