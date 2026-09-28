#!/usr/bin/env node
// 形态契约门岗（2026-09-03）——防「忘了写契约」静默退回人眼对账（L0）。
//
// 背景：拍板样张是 HTML、实现是 React，两套代码描述同一个东西，中间靠人脑翻译 →
// 漂移是结构性的。`tests/ux/_contract.mjs` 把形态意图变成二值断言解决了「能不能查」，
// 但如果没人写契约、或写了没人跑，机制就等于不存在。本门岗守这两件事：
//   1. **有样张的功能面必须有契约文件**（`docs/design/mockups/contracts/<样张名>.{intent,auto}.mjs`）
//   2. **契约必须被至少一条走查引用**（写了不跑 = 装饰品）
//   3. **契约描述的必须还是现行那一版拍板**（2026-09-18 补）
//
// 第 3 条的由来：分镜表 v6（`0d5a56d47`，2026-09-06）重做了信息架构、同步更新了人读的设计合同，
// 却没迁机器契约。上面两条判据当时全绿——契约文件在、走查也引用了——而走查拿 v5 的数字去量 v6 的
// 界面，14 条里 4 条不符，**绿了 12 天**。缺的从来不是「有没有契约」，是「契约还对不对得上那份拍板」。
//
// 判据：每份契约声明 `mechanizes: { doc?, sections?, migratedAt }`。`doc` 是这份契约机械化的**获批正本**
// ——散文设计合同优先，缺省时正本就是 `mockup` 本身（有些面的拍板物就是样张）。v6 那份必须显式指向
// 散文合同，因为它同名的样张恰恰是被推翻的 v5。门岗比对正本**最后一次内容变更**的日期 vs `migratedAt`：
// 正本动了、契约没跟 → 红，并点名要重读哪几节。
//
// 日期只认 git 记录，**绝不用文件 mtime**：`git worktree add` 会把整棵树的 mtime 设成 checkout 那一刻，
// 用 mtime 会让每一棵新开的 worktree 整片翻红。
//
// 两层契约同规范：`*.intent.mjs`（拍板方手写的意图关系）/ `*.auto.mjs`（从样张导出的挂点/几何/token）。
// 任一层存在即算该样张有契约；两层都缺才算欠账。
//
// 棘轮：存量样张多数早于本机制，逐一补契约是独立工程。记基线、只减不增，新增样张必须带契约。
// 重记基线：`node ./scripts/check-mockup-contracts.mjs --baseline`

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOCKUP_DIR = path.join(root, "docs", "design", "mockups");
const CONTRACT_DIR = path.join(MOCKUP_DIR, "contracts");
const WALK_DIR = path.join(root, "tests", "ux");
const baselinePath = path.join(root, "scripts", "mockup-contracts-baseline.json");

if (!fs.existsSync(MOCKUP_DIR)) {
  console.log("✅ 形态契约门岗：无 mockups 目录，跳过。");
  process.exit(0);
}

const mockups = fs
  .readdirSync(MOCKUP_DIR)
  .filter((f) => f.endsWith(".html"))
  .sort();

const contracts = fs.existsSync(CONTRACT_DIR)
  ? fs.readdirSync(CONTRACT_DIR).filter((f) => /\.(intent|auto)\.mjs$/.test(f))
  : [];

// 走查全文（含子目录），用于判断契约有没有被引用。
function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, acc);
    else if (/\.(mjs|js|ts)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const walkText = walkFiles(WALK_DIR)
  .map((f) => fs.readFileSync(f, "utf8"))
  .join("\n");

const missing = []; // 样张没有任何契约文件
const unused = []; // 契约文件没被任何走查引用

for (const html of mockups) {
  const base = html.replace(/\.html$/, "");
  const own = contracts.filter((c) => c.startsWith(`${base}.`));
  if (own.length === 0) missing.push(html);
}
for (const c of contracts) {
  if (!walkText.includes(c) && !walkText.includes(c.replace(/\.mjs$/, ""))) unused.push(c);
}

/** 正本最后一次**内容变更**的日期（YYYY-MM-DD）。没有 git 记录 → undefined（不红，见下）。 */
function lastChangedOn(relPath) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", relPath], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

const stale = []; // 正本动了、契约没跟
const undated = []; // 没声明 mechanizes.migratedAt —— 等于没人说过它对过哪一版
const dangling = []; // mechanizes.doc 指向不存在的文件

for (const c of contracts) {
  const abs = path.join(CONTRACT_DIR, c);
  let contract;
  try {
    contract = (await import(pathToFileURL(abs).href)).default;
  } catch (error) {
    dangling.push({ contract: c, why: `读不出来：${error.message}` });
    continue;
  }
  const mechanizes = contract?.mechanizes;
  const migratedAt = mechanizes?.migratedAt;
  if (!migratedAt) {
    undated.push(c);
    continue;
  }
  // 正本：散文设计合同优先；缺省时样张自己就是拍板物。
  const authority = mechanizes?.doc ?? contract?.mockup;
  if (!authority || !fs.existsSync(path.join(root, authority))) {
    dangling.push({ contract: c, why: `正本不存在：${authority ?? "(没写 doc，contract.mockup 也是空的)"}` });
    continue;
  }
  const authorityDate = lastChangedOn(authority);
  // 没有 git 记录 = 正本和契约多半在同一个还没提交的改动里，判不了先后，不红。
  if (!authorityDate) continue;
  if (authorityDate > migratedAt) {
    stale.push({ contract: c, authority, authorityDate, migratedAt, sections: mechanizes?.sections ?? [] });
  }
}

if (process.argv.includes("--baseline")) {
  fs.writeFileSync(baselinePath, `${JSON.stringify(missing.sort(), null, 2)}\n`);
  console.log(`✅ 已记录基线：${missing.length} 张样张暂无形态契约`);
  process.exit(0);
}

const baseline = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : [];
const known = new Set(baseline);
const newlyMissing = missing.filter((m) => !known.has(m));
const cleared = baseline.filter((b) => !missing.includes(b));

let red = false;

if (newlyMissing.length) {
  red = true;
  console.error(`✖ ${newlyMissing.length} 张新样张没有形态契约：`);
  for (const m of newlyMissing) console.error(`   docs/design/mockups/${m}`);
  console.error(
    "\n  → 新增样张必须同产契约（拍板那刻的人才知道哪些关系承载意图）：",
  );
  console.error(
    `     docs/design/mockups/contracts/<样张名>.intent.mjs —— 见同目录已有样本`,
  );
}

if (unused.length) {
  red = true;
  console.error(`\n✖ ${unused.length} 份契约没有被任何走查引用（写了不跑 = 装饰品）：`);
  for (const u of unused) console.error(`   docs/design/mockups/contracts/${u}`);
  console.error("\n  → 在对应走查里 import 并调用 assertMockupContract（入口在 tests/ux/_assert.mjs）。");
}

if (undated.length) {
  red = true;
  console.error(`\n✖ ${undated.length} 份契约没说它对过哪一版拍板：`);
  for (const u of undated) console.error(`   docs/design/mockups/contracts/${u}`);
  console.error("\n  → 加一段 mechanizes：");
  console.error("     mechanizes: { doc: '<获批设计合同路径，缺省即用 mockup>', sections: ['§…'], migratedAt: 'YYYY-MM-DD' }");
}

if (dangling.length) {
  red = true;
  console.error(`\n✖ ${dangling.length} 份契约的正本指不到东西：`);
  for (const d of dangling) console.error(`   ${d.contract} —— ${d.why}`);
}

if (stale.length) {
  red = true;
  console.error(`\n✖ ${stale.length} 份契约已经过期——它机械化的那份拍板在它之后又动过：`);
  for (const s of stale) {
    console.error(`   ${s.contract}`);
    console.error(`     正本 ${s.authority} 最后变更 ${s.authorityDate}，契约只对到 ${s.migratedAt}`);
    if (s.sections.length) console.error(`     契约自称覆盖：${s.sections.join("、")}`);
    console.error(`     → 读这段 diff：git log -p --since=${s.migratedAt} -- ${s.authority}`);
  }
  console.error("\n  → 逐条对着正本重誊，数字只许从正本抄、不许新编；确认无需改动也要把 migratedAt 改成今天");
  console.error("     （改日期的意思是「我读过那段 diff 了」，不是「让门岗闭嘴」——分镜表 v6 那次就是没人读，绿了 12 天）。");
}

if (red) process.exit(1);

console.log(
  `✅ 形态契约门岗通过：${contracts.length} 份契约全部被走查引用、且都对得上现行拍板；`
  + `欠契约样张 ${missing.length} 张（基线 ${baseline.length}）${cleared.length ? `，本次补齐 ${cleared.length} 张` : ""}。`,
);
