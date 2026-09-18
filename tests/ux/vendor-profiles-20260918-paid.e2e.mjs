// 2026-09-18 接入批的**真机付费验收**（R13 第三段「付费给封印」）：用 Playwright 驱动真实构建产物，
// 经 app 运行时对每个新模型的每个模式各发一次**最小档**真实生成，验证 vendor 真的接受我们的请求形状。
//
// 与单测的分工：单测锁的是「body 长什么样」（干跑），这里锁的是「vendor 收不收」——
// 两家的枚举/字段名/大小写差异只有真发才证得出（apimart 的 resolution 小写、kie 的 input_urls、
// Gemini 的 image_urls 键名转接、Grok 没有改图端点）。
//
// **会花真实额度**。凭据：走 evals/lib/isoApp 的 prepareIsolation——把**真实** model-catalog.json
// （含 safeStorage 密文 key）拷进隔离 settings，userData/项目库仍隔离，绝不碰用户真实资料库
// （见记忆 walkthrough-default-profile-is-isolated / iso-walkthrough-key-seeding-traps）。
// 额度闸：不显式 PAID_E2E=1 就 SKIP。
// 用法：pnpm run build && PAID_E2E=1 node tests/ux/vendor-profiles-20260918-paid.e2e.mjs
//   ONLY=am-flare-t2i,kie-imagen4-fast 只跑指定用例省额度。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareIsolation, launchIsolatedApp } from "../../evals/lib/isoApp.mjs";
// 等待上限走公共预算 owner（tests/ux/_station-budget.mjs），不自造墙钟常量：
// 私有数字没人能随环境调，check:test-waits 的 station 棘轮会当场红。
import { stationTimeout } from "./_station-budget.mjs";

/** 一次「真人点确认生成」的安全上限：本地界面动作，不含模型一轮。 */
const CONFIRM_CLICK_MS = stationTimeout({ operations: 6 });

if (!process.env.PAID_E2E) {
  console.log("SKIP vendor-profiles-20260918-paid: 会花额度。PAID_E2E=1 node tests/ux/vendor-profiles-20260918-paid.e2e.mjs 才跑。");
  process.exit(0);
}

const ONLY = (process.env.ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
const OUT = process.env.PAID_OUT || path.join(os.tmpdir(), "nomi-paid-20260918");
fs.mkdirSync(OUT, { recursive: true });

// 参考图用**特征极强**的一张（纯色块 + 大字），这样「参考有没有真的传到」肉眼一看便知
// （R5 三段流程：产物要双验提示词特征 + 参考特征，HTTP 200 不算通）。
const REF = process.env.PAID_REF_IMG || "https://placehold.co/1024x1024/FF0000/FFFFFF/png?text=NOMI";

/** 全部最小档：1:1 + 1K + 最低质量档。i2i 只喂 1 张参考图。 */
const CASES = [
  // ── apimart ───────────────────────────────────────────────────────────────
  { id: "am-flare-t2i", vendor: "apimart", labelZh: "GPT Image 2.5 Flare · 文生图", kind: "text_to_image",
    extras: { modelKey: "gpt-image-2.5-flare", size: "1:1", resolution: "1K", quality: "low", background: "auto" },
    prompt: "a single red maple leaf on white paper, studio light" },
  { id: "am-flare-i2i", vendor: "apimart", labelZh: "GPT Image 2.5 Flare · 改图（input_urls→image_urls 转接）", kind: "image_edit",
    extras: { modelKey: "gpt-image-2.5-flare", size: "1:1", resolution: "1K", quality: "low", background: "auto",
      archetypeInput: { input_urls: [REF] } },
    prompt: "keep the red background and the white NOMI lettering, add a thin golden border" },
  { id: "am-sunburst-t2i", vendor: "apimart", labelZh: "GPT Image 2.5 Sunburst · 文生图", kind: "text_to_image",
    extras: { modelKey: "gpt-image-2.5-sunburst", size: "1:1", resolution: "1K", quality: "low", background: "auto" },
    prompt: "a single blue feather on white paper, studio light" },
  { id: "am-sunburst-i2i", vendor: "apimart", labelZh: "GPT Image 2.5 Sunburst · 改图", kind: "image_edit",
    extras: { modelKey: "gpt-image-2.5-sunburst", size: "1:1", resolution: "1K", quality: "low", background: "auto",
      archetypeInput: { input_urls: [REF] } },
    prompt: "keep the red background and the white NOMI lettering, add a thin silver border" },
  { id: "am-gemini3pro-t2i", vendor: "apimart", labelZh: "Gemini 3 Pro 图像 · 文生图", kind: "text_to_image",
    extras: { modelKey: "gemini-3-pro-image-preview", size: "1:1", resolution: "1K" },
    prompt: "a single green pear on a white table, soft daylight" },
  { id: "am-gemini3pro-i2i", vendor: "apimart", labelZh: "Gemini 3 Pro 图像 · 改图（reference_image_urls→image_urls 转接）", kind: "image_edit",
    extras: { modelKey: "gemini-3-pro-image-preview", size: "1:1", resolution: "1K",
      archetypeInput: { reference_image_urls: [REF] } },
    prompt: "keep the red background and the white NOMI lettering, add a soft drop shadow" },
  { id: "am-grok-t2i", vendor: "apimart", labelZh: "Grok Imagine 2.0 · 文生图（唯一模式）", kind: "text_to_image",
    extras: { modelKey: "grok-imagine-2.0-ext", size: "1:1" },
    prompt: "a single yellow rubber duck on a white table" },

  // ── kie ───────────────────────────────────────────────────────────────────
  // 2026-09-18 实测：kie 账户余额不足，createTask 直接 402
  //   "Credits insufficient : Your current balance isn't enough to run this request."
  // → 本批 kie 的 6 条（GPT Image 2.5 Flare/Sunburst × t2i/改图、Imagen 4 Fast/Ultra）
  //   记 **unverified**，不换供应商兜底、不反复重跑（402 是预扣前就拒，没有产生花费）。
  //   充值后用 ONLY=kie-... 补跑即可，用例定义留在下面的 KIE_CASES 里不删。
];

/** kie 侧用例（余额不足，本轮 unverified）。充值后 PAID_INCLUDE_KIE=1 打开。 */
const KIE_CASES = [
  { id: "kie-imagen4-fast", vendor: "kie", labelZh: "Imagen 4 Fast · 文生图", kind: "text_to_image",
    extras: { modelKey: "google/imagen4-fast", aspect_ratio: "1:1" },
    prompt: "a single orange on a white table, soft daylight" },
  { id: "kie-imagen4-ultra", vendor: "kie", labelZh: "Imagen 4 Ultra · 文生图", kind: "text_to_image",
    extras: { modelKey: "google/imagen4-ultra", aspect_ratio: "1:1" },
    prompt: "a single lemon on a white table, soft daylight" },
  { id: "kie-flare-t2i", vendor: "kie", labelZh: "GPT Image 2.5 Flare · 文生图（kie）", kind: "text_to_image",
    extras: { modelKey: "gpt-image-2-5-flare-text-to-image", aspect_ratio: "1:1", resolution: "1K", background: "auto",
      archetypeInput: { model: "gpt-image-2-5-flare-text-to-image" } },
    prompt: "a single red maple leaf on white paper, studio light" },
  { id: "kie-flare-i2i", vendor: "kie", labelZh: "GPT Image 2.5 Flare · 改图（kie，input_urls）", kind: "image_edit",
    extras: { modelKey: "gpt-image-2-5-flare-text-to-image", aspect_ratio: "1:1", resolution: "1K", background: "auto",
      archetypeInput: { model: "gpt-image-2-5-flare-image-to-image", input_urls: [REF] } },
    prompt: "keep the red background and the white NOMI lettering, add a thin golden border" },
  { id: "kie-sunburst-t2i", vendor: "kie", labelZh: "GPT Image 2.5 Sunburst · 文生图（kie）", kind: "text_to_image",
    extras: { modelKey: "gpt-image-2-5-sunburst-text-to-image", aspect_ratio: "1:1", resolution: "1K", background: "auto",
      archetypeInput: { model: "gpt-image-2-5-sunburst-text-to-image" } },
    prompt: "a single blue feather on white paper, studio light" },
  { id: "kie-sunburst-i2i", vendor: "kie", labelZh: "GPT Image 2.5 Sunburst · 改图（kie）", kind: "image_edit",
    extras: { modelKey: "gpt-image-2-5-sunburst-text-to-image", aspect_ratio: "1:1", resolution: "1K", background: "auto",
      archetypeInput: { model: "gpt-image-2-5-sunburst-image-to-image", input_urls: [REF] } },
    prompt: "keep the red background and the white NOMI lettering, add a thin silver border" },
];

const pool = process.env.PAID_INCLUDE_KIE ? [...CASES, ...KIE_CASES] : CASES;
const cases = ONLY.length ? pool.filter((c) => ONLY.includes(c.id)) : pool;
const results = [];

// **两段式 + 一条用例一个短命实例**（2026-09-18 用户要求 + 本机现实）：
//   ① 提交段：为每条用例单独起一个实例，铸令牌 → createTask → **立刻退出**（窗口只存活几秒）；
//   ② 取件段：所有任务提交完后，再起一个实例统一轮询取结果。
// 两个理由：用户正在用这台机器，验收实例不许长时间占前台；而且这台机器当下磁盘 99% 满、
// load ~10、29 个 Electron 进程，长跑的实例会在轮询中途被系统压力干掉——那不是产品缺陷，
// 但会把「已经付过钱的任务」变成查不到结果的孤儿。分两段后，付费那一刻只占几秒，
// 取件随时可重来且**零额外花费**（任务 id 在手，重查不重发）。
async function withApp(name, fn) {
  const iso = prepareIsolation(path.join(os.tmpdir(), `nomi-paid-0918-${name}`), { requireCatalog: true });
  const { app, win } = await launchIsolatedApp(process.cwd(), iso);
  try {
    // 实例刚起来就直接打付费 IPC 会连窗口一起带走（实测）；先做一次无害调用热身并确认凭据在位。
    const vendors = await win.evaluate(() => window.nomiDesktop.modelCatalog.listVendors());
    console.log(`  · 实例就绪（${name}）`);
    return await fn(win, vendors);
  } finally {
    await app.close().catch(() => undefined); // 跑完立刻退，不留窗口
    // 上一个实例要彻底死透再起下一个：连着起会让新实例在窗口刚出来时就被带走
    // （实测症状是 "Application exited" / "Target page…closed"，看着像产品崩，其实是实例互踩）。
    await new Promise((r) => setTimeout(r, 6000));
  }
}

/** 提交一条用例，拿 taskId 就走。重试只发生在**还没拿到 taskId** 时（否则会重复扣费）。 */
async function submitCase(c) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await withApp(`submit-${c.id}`, async (win, vendors) => {
        const cred = (vendors || []).find((x) => x.key === c.vendor || x.vendorKey === c.vendor);
        if (!(cred?.hasApiKey ?? cred?.enabledApiKey)) throw new Error(`${c.vendor} 没有可用 key`);
        // 钱的闸照旧走：一条用例一颗令牌、maxAttempts 1，绝不铸大令牌让整批随便烧。
        const nodeId = `paid-0918-${c.id}`;
        const { grantId } = await win.evaluate(async (id) =>
          await window.nomiDesktop.tasks.grantSpend({ nodeIds: [id], maxAttemptsPerNode: 1 }), nodeId);
        if (!grantId) throw new Error("铸令牌失败");
        console.log("  · 令牌已铸，发 createTask…");
        // createTask 挂住时**取证再放弃**：截一张图 + 扒一段 DOM 文本。2026-09-18 这条挂住查了半天，
        // 光看日志分不清是「请求发不出去」还是「界面上弹了个框在等人点」——证据比猜快。
        const RUN_TIMEOUT_MS = Number(process.env.PAID_RUN_TIMEOUT_MS || 180000);
        const runPromise = win.evaluate(async (a) =>
          await window.nomiDesktop.tasks.run({ vendor: a.vendor, request: { kind: a.kind, prompt: a.prompt, extras: { ...a.extras, nodeId: a.nodeId, grantId: a.grantId } } }),
          { ...c, nodeId, grantId });
        // **真人那一下**：`tasks.run` 会挂起，等界面上的付费确认框被点（「AI 助手想生成一个素材 ·
        // 需你确认花费 → 确认生成」）。这不是产品 bug，正是 CLAUDE.md 那条「钱的闸 = 每次提交看报价确认」。
        // 2026-09-18 查了半天才看清：日志只显示 createTask 发出后无响应，截图一看是弹框在等人点。
        // 验收脚本必须像真人一样点这一下（记忆 tests-must-drive-ui-like-a-human），
        // 不许绕过闸门——本轮用户已就总额（≤$5）授权，逐条仍走确认框。
        const confirmed = win.getByRole("button", { name: "确认生成" }).click({ timeout: CONFIRM_CLICK_MS })
          .then(() => console.log("  · 已点「确认生成」（付费确认框）"))
          .catch(() => undefined); // 没弹框（比如被缓存命中）就不用点
        void confirmed;
        let timer;
        const initial = await Promise.race([
          runPromise,
          new Promise((_, reject) => { timer = setTimeout(async () => {
            const shot = path.join(OUT, `HANG-${c.id}.png`);
            try { await win.screenshot({ path: shot }); console.log(`  · 挂住取证：截图 ${shot}`); } catch (e) { console.log(`  · 截图失败：${String(e?.message || e).slice(0, 120)}`); }
            reject(new Error(`tasks.run 超过 ${RUN_TIMEOUT_MS}ms 没返回（已截图）`));
          }, RUN_TIMEOUT_MS); }),
        ]).finally(() => clearTimeout(timer));
        if (!initial?.id) throw new Error(`无 taskId（createTask 被拒）：${JSON.stringify(initial)?.slice(0, 300)}`);
        return initial.id;
      });
    } catch (err) {
      const msg = String(err?.message || err);
      if (attempt === 2 || /402|insufficient|balance|quota/i.test(msg)) throw err;
      console.log(`  ↻ 提交前就挂了（${msg.slice(0, 70)}），重开实例再试（未花钱）`);
    }
  }
  throw new Error("unreachable");
}

const submitted = [];
for (const c of cases) {
  console.log(`\n▶ 提交 [${c.vendor}] ${c.labelZh}`);
  try {
    const taskId = await submitCase(c);
    console.log(`  ✓ createTask 接受 taskId=${taskId}`);
    submitted.push({ c, taskId });
  } catch (err) {
    const msg = String(err?.message || err);
    console.log(`  ✗ ${msg.slice(0, 300)}`);
    results.push({ id: c.id, ok: false, err: msg, unverified: /402|insufficient|balance|quota/i.test(msg) });
  }
}

// ② 取件段：统一轮询。取件零花费，失败可随时用 results.json 里的 taskId 重查。
if (submitted.length) {
  await withApp("collect", async (win) => {
    const pending = new Map(submitted.map((s) => [s.taskId, s]));
    for (let round = 1; round <= 30 && pending.size; round++) {
      await new Promise((r) => setTimeout(r, 8000));
      for (const [taskId, s] of [...pending]) {
        let final;
        try {
          const resp = await win.evaluate(async (a) =>
            await window.nomiDesktop.tasks.result({ taskId: a.taskId, vendor: a.vendor, taskKind: a.kind, prompt: a.prompt, modelKey: a.modelKey }),
            { taskId, vendor: s.c.vendor, kind: s.c.kind, prompt: s.c.prompt, modelKey: s.c.extras.modelKey });
          final = resp?.result;
        } catch (err) { console.log(`  ! ${s.c.id} 查件出错：${String(err?.message || err).slice(0, 120)}`); continue; }
        if (!final || !["succeeded", "failed"].includes(final.status)) continue;
        pending.delete(taskId);
        if (final.status !== "succeeded") {
          const msg = final.errorMessage || final.error || final.message || "(无错误文本)";
          console.log(`  ✗ ${s.c.id} 生成失败：${String(msg).slice(0, 200)}`);
          results.push({ id: s.c.id, ok: false, taskId, err: String(msg).slice(0, 400) });
          continue;
        }
        const url = (final.assets || []).find((x) => x.url)?.url;
        const cost = final.raw?.data?.cost ?? null;
        if (!url) { results.push({ id: s.c.id, ok: false, taskId, err: "succeeded 但没有产物 url" }); continue; }
        const dest = path.join(OUT, `${s.c.id}.png`);
        fs.writeFileSync(dest, Buffer.from(await (await fetch(url)).arrayBuffer()));
        console.log(`  ✓ ${s.c.id} 出图 ${dest}${cost !== null ? ` cost=$${cost}` : ""}`);
        results.push({ id: s.c.id, ok: true, taskId, file: dest, costUsd: cost });
      }
    }
    for (const [taskId, s] of pending) {
      console.log(`  ⏳ ${s.c.id} 超时未终结（taskId=${taskId}，已付费，可用 tests/ux/vendor-profiles-20260918-fetch.mjs 重查）`);
      results.push({ id: s.c.id, ok: false, taskId, err: "轮询超时未终结（已提交，可重查）" });
    }
  });
}

const pass = results.filter((r) => r.ok).length;
console.log(`\n═══ 付费验收：${pass}/${cases.length} 通过 ═══`);
for (const r of results) console.log(`  ${r.ok ? "✓" : r.unverified ? "∅" : "✗"} ${r.id}${r.ok ? ` — ${r.file}${r.costUsd !== null && r.costUsd !== undefined ? ` ($${r.costUsd})` : ""}` : ` — ${String(r.err).slice(0, 200)}`}`);
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
process.exit(pass === cases.length ? 0 : 1);
