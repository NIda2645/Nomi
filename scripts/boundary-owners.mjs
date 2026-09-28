// 读根因合同里 `shared_boundaries` 声明的 owner，核对「这个主人今天是不是还在那儿」。
//
// 判据只从合同现读，本模块不另存一份 owner 名单——另写一份就又是一个手抄真相源，
// 正是这批合同要消灭的东西。台账（boundary-owners-ledger.json）只对**已声明**的条目
// 做三种处置：搬家了（换个地方接着核）／退役了（写明理由）／还没查（棘轮只减不增），
// 它不能凭空增加一个 owner。
import fs from "node:fs";
import path from "node:path";

export const VERDICT = {
  OK: "ok",
  PATH_MISSING: "path-missing",
  SYMBOL_MISSING: "symbol-missing",
  UNREADABLE: "unreadable-symbol",
};

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*(?:\(\))?$/;
const SYMBOL_SEPARATORS = /\s+and\s+|\s+plus\s+|\s*\/\s*|\s*,\s*|\s*\+\s*|\s+与\s+|、/;

export function splitSymbol(symbol) {
  return String(symbol).split(SYMBOL_SEPARATORS).map((part) => part.trim()).filter(Boolean);
}

/** JS 标识符的词边界：前后都不能再接标识符字符，否则 `foo` 会被 `fooBar` 冒充。 */
export function hasWord(text, name) {
  return new RegExp(`(?<![A-Za-z0-9_$])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9_$])`).test(text);
}

function identifierHead(part) {
  const match = /^([A-Za-z_$][A-Za-z0-9_$]*)/.exec(part.replace(/\(\)$/, ""));
  return match ? match[1] : part;
}

/**
 * 三层解析，从最不会误判的一层开始：
 *  1. 整串拆开后每一段都长得像标识符 —— 逐段按**词边界**核。
 *     不能用 includes 子串：`assertSafeUrl` 改名成 `assertSafeUrlV2` 时子串仍然命中，
 *     门岗会假绿——这正是变异测试第一次跑出来的那个洞。
 *  2. 不是标识符，但整串字面量在文件里原样出现 —— 覆盖 `check:standard-formats`、
 *     `data-project-id`、`tab === 'file'` 这类完全可核的写法，零误判。
 *  3. 都不是 —— 判为「机器读不了」，进普查，不判红也不静默跳过。
 */
export function resolveSymbol(symbol, text) {
  const parts = splitSymbol(symbol);
  if (parts.length > 0 && parts.every((part) => IDENTIFIER.test(part))) {
    const missing = parts.filter((part) => !hasWord(text, identifierHead(part)));
    return missing.length ? { verdict: VERDICT.SYMBOL_MISSING, missing } : { verdict: VERDICT.OK, missing: [] };
  }
  if (text.includes(String(symbol).trim())) return { verdict: VERDICT.OK, missing: [] };
  return { verdict: VERDICT.UNREADABLE, missing: [] };
}

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(child, out);
    else out.push(child);
  }
}

/** 把一条 boundary 的 path 读成「用来找符号的那段文本」。目录/通配符展开成其下全部文件。 */
export function readBoundaryText(repoRoot, boundaryPath) {
  const cleaned = String(boundaryPath).replace(/\/\*\*$/, "").replace(/\/\*$/, "").replace(/\/$/, "");
  const absolute = path.join(repoRoot, cleaned);
  let stat;
  try { stat = fs.statSync(absolute); } catch { return null; }
  if (stat.isFile()) {
    try { return fs.readFileSync(absolute, "utf8"); } catch { return null; }
  }
  const files = [];
  walk(absolute, files);
  if (files.length === 0) return null;
  return files.map((file) => { try { return fs.readFileSync(file, "utf8"); } catch { return ""; } }).join("\n");
}

export function boundaryIdentity(entry) {
  return `${entry.contract}::${entry.path}::${entry.symbol}`;
}

export function readContracts(repoRoot) {
  const dir = path.join(repoRoot, "docs", "fixes");
  if (!fs.existsSync(dir)) return [];
  const entries = [];
  const seen = new Set();
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".root-cause.json")).sort()) {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")); } catch { continue; }
    for (const boundary of Array.isArray(parsed?.shared_boundaries) ? parsed.shared_boundaries : []) {
      if (!boundary?.path || !boundary?.symbol) continue;
      const entry = { contract: `docs/fixes/${file}`, path: String(boundary.path), symbol: String(boundary.symbol) };
      const identity = boundaryIdentity(entry);
      if (seen.has(identity)) continue;
      seen.add(identity);
      entries.push(entry);
    }
  }
  return entries;
}

/** 核一条：主人还在不在那个路径上。 */
export function checkBoundary(repoRoot, entry, cache = new Map()) {
  let text = cache.get(entry.path);
  if (text === undefined) { text = readBoundaryText(repoRoot, entry.path); cache.set(entry.path, text); }
  if (text === null) return { ...entry, verdict: VERDICT.PATH_MISSING, missing: [] };
  const resolved = resolveSymbol(entry.symbol, text);
  return { ...entry, verdict: resolved.verdict, missing: resolved.missing };
}

export function auditBoundaries(repoRoot, entries = readContracts(repoRoot)) {
  const cache = new Map();
  return entries.map((entry) => checkBoundary(repoRoot, entry, cache));
}

/**
 * 台账裁决。规则对称：**台账条目陈旧（该条已经自己好了）同样判红**，
 * 否则台账会永远记着一堆早就不成立的豁免，变成另一处「以为有人在管」。
 */
export function evaluate({ results, ledger }) {
  const reanchored = new Map((ledger?.reanchored || []).map((row) => [boundaryIdentity(row), row]));
  const retirements = new Map((ledger?.retirements || []).map((row) => [boundaryIdentity(row), row]));
  const unverified = new Map((ledger?.unverified || []).map((row) => [boundaryIdentity(row), row]));
  const unreadable = new Map((ledger?.unreadable_symbols || []).map((row) => [boundaryIdentity(row), row]));

  const errors = [];
  const stats = { total: results.length, ok: 0, reanchored: 0, retired: 0, unverified: 0, unreadable: 0, broken: 0 };
  const live = new Set(results.map(boundaryIdentity));
  const cache = new Map();
  const repoRoot = ledger?.__repoRoot;

  for (const result of results) {
    const identity = boundaryIdentity(result);
    const inLedger = reanchored.has(identity) || retirements.has(identity) || unverified.has(identity);

    if (result.verdict === VERDICT.UNREADABLE) {
      if (!unreadable.has(identity)) {
        errors.push(`合同写了机器读不了的 symbol，且没进普查表：${identity}\n    → symbol 要写成标识符（可用 / , and 分隔），或写成文件里能原样搜到的字面量`);
      }
      stats.unreadable += 1;
      continue;
    }
    if (unreadable.has(identity)) {
      errors.push(`普查表条目已经可读了，请从 unreadable_symbols 删掉（棘轮只减不增）：${identity}`);
    }

    if (result.verdict === VERDICT.OK) {
      stats.ok += 1;
      if (inLedger) {
        errors.push(`台账条目已经自己好了，请从台账删掉（棘轮只减不增）：${identity}`);
      }
      continue;
    }

    // 到这里 = 声明过的主人不在了
    if (reanchored.has(identity)) {
      const row = reanchored.get(identity);
      const moved = checkBoundary(repoRoot, { contract: row.contract, path: row.anchor.path, symbol: row.anchor.symbol }, cache);
      if (moved.verdict === VERDICT.OK) { stats.reanchored += 1; continue; }
      errors.push(`改锚登记指向的新主人也不在了：${identity}\n    → 登记的新锚 ${row.anchor.path} :: ${row.anchor.symbol}（${moved.verdict}）`);
      stats.broken += 1;
      continue;
    }
    if (retirements.has(identity)) { stats.retired += 1; continue; }
    if (unverified.has(identity)) { stats.unverified += 1; continue; }

    stats.broken += 1;
    const detail = result.verdict === VERDICT.PATH_MISSING
      ? `路径不存在：${result.path}`
      : `符号不在那个文件里：${result.missing.join(" / ")}`;
    errors.push(`合同声明过的主人不在了：${identity}\n    → ${detail}`);
  }

  for (const [identity, bucket] of [
    ...[...reanchored.keys()].map((k) => [k, "reanchored"]),
    ...[...retirements.keys()].map((k) => [k, "retirements"]),
    ...[...unverified.keys()].map((k) => [k, "unverified"]),
    ...[...unreadable.keys()].map((k) => [k, "unreadable_symbols"]),
  ]) {
    if (!live.has(identity)) errors.push(`台账 ${bucket} 指向一条合同里已经没有的边界，请删掉：${identity}`);
  }

  return { ok: errors.length === 0, errors, stats };
}
