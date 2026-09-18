// 取件工具：**零额外花费**地重查一条已经付过费的任务的结果。
//
// 为什么单独一个脚本：付费验收分两段（提交 / 取件，见 vendor-profiles-20260918-paid.e2e.mjs 的注释）。
// 提交那一刻钱就花了，取件失败（实例被系统压力干掉、机器重启、轮询超时）**不该再发一次请求**。
// 任务 id 在 <tmp>/nomi-paid-20260918/results.json 里，拿它重查即可，重查多少次都不花钱。
//
// 用法：node tests/ux/vendor-profiles-20260918-fetch.mjs <taskId> [vendor] [modelKey] [taskKind] [outName]
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { prepareIsolation, launchIsolatedApp } from "../../evals/lib/isoApp.mjs";

const [taskId, vendor = "apimart", modelKey = "gpt-image-2.5-flare", taskKind = "text_to_image", outName] = process.argv.slice(2);
if (!taskId) { console.error("用法：node tests/ux/vendor-profiles-20260918-fetch.mjs <taskId> [vendor] [modelKey] [taskKind] [outName]"); process.exit(2); }

const iso = prepareIsolation(path.join(os.tmpdir(), "nomi-paid-0918-fetch"), { requireCatalog: true });
const { app, win } = await launchIsolatedApp(process.cwd(), iso);
try {
  // 实例刚起来就直接打 IPC 会连窗口一起带走（高负载机器实测）；先做一次无害调用热身。
  await win.evaluate(() => window.nomiDesktop.modelCatalog.listVendors());
  const resp = await win.evaluate(async (a) =>
    await window.nomiDesktop.tasks.result({ taskId: a.taskId, vendor: a.vendor, taskKind: a.taskKind, prompt: "", modelKey: a.modelKey }),
    { taskId, vendor, modelKey, taskKind });
  const final = resp?.result;
  console.log(`status=${final?.status} cost=${final?.raw?.data?.cost ?? "?"}`);
  const url = (final?.assets || []).find((x) => x.url)?.url;
  if (!url) { console.log(JSON.stringify(final).slice(0, 800)); process.exit(1); }
  const out = path.join(os.tmpdir(), "nomi-paid-20260918", `${outName || taskId}.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await (await fetch(url)).arrayBuffer()));
  console.log("SAVED", out);
} finally {
  await app.close().catch(() => undefined); // 跑完立刻退，不留窗口
}
