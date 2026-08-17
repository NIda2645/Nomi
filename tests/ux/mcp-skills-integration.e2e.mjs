// P3#1 真集成测试（闭之前只有 mock 单测的缺口）：起真 MCP stdio 服务（app 自身二进制 + NOMI_MCP_STDIO=1，
// = Claude Code/Codex/WorkBuddy 拉起它的真路径），像外部 agent 那样发 JSON-RPC，验真 skillStore 把 23 个
// 导演/编剧技能经 resources + prompts 真的 list/read 出来。零生成额度（只读技能，不碰模型/项目）。
// 用法：pnpm run build && node tests/ux/mcp-skills-integration.e2e.mjs
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { withLinuxNoSandbox } from "./_launchApp.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// 隔离 settings 目录 → stdio 服务读不到用户真 app 的 lockfile → 走 headless dispatch（本仓新代码），
// 而不是把 skills.list 转发给用户正在运行的旧构建（那会报「未知方法」）。技能仍从仓内 skills/ 加载。
const tempSettings = mkdtempSync(path.join(os.tmpdir(), "nomi-mcp-it-"));

let passed = 0;
function assert(cond, label) {
  if (!cond) { console.log(`  ✗ ${label}`); throw new Error(`FAIL: ${label}`); }
  passed += 1;
  console.log(`  ✓ ${label}`);
}

// 起真 MCP stdio 服务（dev：electron 二进制 + args=[repoRoot] + NOMI_MCP_STDIO=1，见 mcpConfig.ts）。
const child = spawn(require("electron"), withLinuxNoSandbox([repoRoot, "--disable-gpu"]), {
  cwd: repoRoot,
  // NOMI_CAPABILITY_DIR 隔离能力核 lockfile（否则探到用户运行中的真 app → 把 skills.list 转发给旧构建报错）。
  env: { ...process.env, NOMI_MCP_STDIO: "1", NOMI_SETTINGS_DIR: tempSettings, NOMI_ELECTRON_USER_DATA_DIR: tempSettings, NOMI_CAPABILITY_DIR: path.join(tempSettings, "capability-core") },
  stdio: ["pipe", "pipe", "inherit"],
});

const pending = new Map();
let seq = 0;
const rl = readline.createInterface({ input: child.stdout });
rl.on("line", (line) => {
  const t = line.trim();
  if (!t.startsWith("{")) return; // 非 JSON 行（启动杂质）忽略
  let msg;
  try { msg = JSON.parse(t); } catch { return; }
  if (msg.id != null && pending.has(msg.id)) {
    const { resolve, timer } = pending.get(msg.id);
    clearTimeout(timer);
    pending.delete(msg.id);
    resolve(msg);
  }
});

function rpc(method, params, timeoutMs = 30000) {
  const id = (seq += 1);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC 超时: ${method}`)); }, timeoutMs);
    pending.set(id, { resolve, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

try {
  // 起服务要点时间（app.whenReady → startMcpStdioServer）。initialize 自带重试等它就绪。
  let init = null;
  for (let i = 0; i < 20 && !init; i++) {
    try { init = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {} }, 4000); }
    catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  assert(init && init.result, "initialize 有响应（MCP stdio 服务起来了）");
  const caps = init.result.capabilities || {};
  assert(caps.tools && caps.resources && caps.prompts, "广告 tools + resources + prompts 能力");

  const list = (await rpc("resources/list", {})).result;
  const uris = (list.resources || []).map((r) => r.uri);
  assert(list.resources.length >= 20, `resources/list 返回 ≥20 技能（实=${list.resources.length}）`);
  assert(uris.includes("nomi-skill://director-cinematography"), "含 director-cinematography 资源");
  assert(uris.includes("nomi-skill://writer-dialogue"), "含 writer-dialogue 资源");
  const cin = list.resources.find((r) => r.uri === "nomi-skill://director-cinematography");
  assert(cin && cin.name === "director.cinematography" && (cin.description || "").length > 5, "资源带 name + 非空 description");
  // 渐进披露：list 不含正文
  assert(cin && cin.text === undefined && cin.body === undefined, "resources/list 不含正文（渐进披露）");

  const read = (await rpc("resources/read", { uri: "nomi-skill://director-shot-translation" })).result;
  const text = read.contents?.[0]?.text || "";
  assert(text.includes("运镜") || text.includes("翻译") || text.length > 200, "resources/read 载入真实技能正文");

  const prompts = (await rpc("prompts/list", {})).result;
  const pnames = (prompts.prompts || []).map((p) => p.name);
  assert(pnames.includes("director-cinematography"), "prompts/list 用 directoryName 当命令名（斜杠友好）");

  const badRead = await rpc("resources/read", { uri: "nomi-skill://nope-nonexistent" });
  assert(badRead.error, "未知技能资源回 error");

  console.log(`\nMCP-SKILLS-INTEGRATION PASS: ${passed} assertions（真 stdio 服务 · 真 skillStore · 零生成额度）`);
  child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 300);
} catch (err) {
  console.log(`✗ ${err?.message || err}`);
  child.kill("SIGTERM");
  setTimeout(() => process.exit(1), 300);
}
