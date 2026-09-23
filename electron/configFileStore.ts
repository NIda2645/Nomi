// 用户配置文件的读写原语（2026-09-21，批次 E「配置不许静默消失」）。
//
// 为什么要这一层：userData 下的配置（model-catalog.json + settings/*.json）此前每个文件各自
// 回答「读不出来怎么办」——`readJson(path, fallback)` 吞掉一切异常回落默认，`try { readJsonFile }
// catch { DEFAULT }` 同形写了十几份。语义没有主人，于是出现两种都不报错的丢失：
//   · 目录：读失败 → 立刻把空目录**原子写回**覆盖用户文件（catalogStore 旧 :69-74），
//     一次 JSON 解析失败 / 一次 Windows 文件锁 = 永久抹掉全部模型配置；
//   · 设置：读失败 → 内存里用默认值跑，**下一次写**把默认值落盘，用户的偏好安静消失。
// 根因调查：scratchpad `rootcause-config-loss-on-reinstall.md` §3「结构性发现」。
//
// 这一层只回答三个问题，全项目配置读写都必须经过它：
//   1. **文件不存在**和**存在但读不了**是两件事。前者才允许写默认（首次运行）；后者一律不写。
//   2. 读不了的文件**原样保留**。语法损坏的那一份改名留底（`<名>.broken-<时间戳>.json`，
//      同目录、内容逐字节不变），只是打不开的（锁/权限，可能是一瞬间的）**一个字节都不碰**。
//   3. 每次写盘前把上一版轮转成 `<名>.bak.json`；跨版本迁移前再留一份带版本号的
//      `<名>.v<旧版本>.bak.json`（保留最近 MAX_VERSION_BACKUPS 份）。
//
// 读函数是**纯的**：它不改盘（`readConfigFile` 只 stat + 读 + 记一条观察）。改名留底是
// 一个显式动作 `quarantineUnreadableConfigFile`，由那份配置的 owner 在决定「这份我用不了」
// 之后自己调——名字承诺「我只算答案」的函数不许改用户的盘（check:read-path-writes 同一条纪律）。
import fs from "node:fs";
import path from "node:path";

import { readJsonFile, renameSyncWithRetry, writeJsonFileAtomic, type WriteJsonFileAtomicOptions } from "./jsonFile";

/** 语法损坏（读得到字节、解析不了）与打不开（锁/权限/IO）要分开处置：前者留底，后者别碰。 */
export type ConfigReadFailureReason = "corrupt" | "unreadable";

export type ConfigFileReadResult<T> =
  | { status: "ok"; value: T }
  | { status: "missing" }
  | { status: "failed"; reason: ConfigReadFailureReason; message: string };

export type ConfigReadFailure = Readonly<{
  filePath: string;
  reason: ConfigReadFailureReason;
  message: string;
  /** 已改名留底的那份的绝对路径；没留成（或按规矩不该留）时为 null。 */
  quarantinedPath: string | null;
  at: string;
}>;

/**
 * 本次进程里「这份配置读失败过」的账本。
 *
 * 它就是「本次以只读运行」那条语义的持有者：只要某份配置还在账本里，它的写路径必须拒绝落盘
 * ——我们不知道盘上那份是什么，就绝不能盖掉它。账本**只在这份文件重新读通时**才销账
 * （`missing` 不算读通：改名留底之后文件确实不在了，但这一次会话仍然不许写回）。
 * 进程重启自然清空：下次启动文件要么已恢复、要么真不存在，两条路都有明确处置。
 */
const readFailures = new Map<string, ConfigReadFailure>();

/**
 * 已改名留底的那些配置（本次进程内）。
 *
 * 和上面那本账**故意分开**：留底之后原位已经没有文件了，再拦写盘就是把用户永久锁在只读里
 * （损坏的文件不会自己变好）。所以留底销掉写禁令、但留下一条给界面看的通知——
 * 「你的配置读不了，原件已另存为 X」。少了这条，留底就等于静默删除。
 */
const quarantines = new Map<string, ConfigReadFailure>();

function key(filePath: string): string {
  return path.resolve(filePath);
}

/** 有记录 = 盘上那份**还在、但读不出来** → 写路径必须拒绝，我们不知道会盖掉什么。 */
export function configReadFailure(filePath: string): ConfigReadFailure | null {
  return readFailures.get(key(filePath)) ?? null;
}

export function configQuarantineNotice(filePath: string): ConfigReadFailure | null {
  return quarantines.get(key(filePath)) ?? null;
}

export function listConfigReadFailures(): ConfigReadFailure[] {
  return [...readFailures.values(), ...quarantines.values()];
}

/** Windows 文件名不许有 `:`，ISO 时间戳直接拼上去会写不出来（而且失败得很晚）。 */
function timestampSuffix(at: Date): string {
  return at.toISOString().replace(/[:.]/g, "-");
}

function withSuffix(filePath: string, suffix: string): string {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  return path.join(dir, `${base}.${suffix}${ext}`);
}

export function configBackupPath(filePath: string): string {
  return withSuffix(filePath, "bak");
}

export function configVersionBackupPath(filePath: string, version: number): string {
  return withSuffix(filePath, `v${Math.trunc(version)}.bak`);
}

/**
 * 纯读：不写盘、不改名。
 *
 * `missing` 只有一个来源——文件真的不在。其余任何异常都是 `failed`，调用方**不得**因此写默认值
 * 覆盖它（这正是旧 `readJson(path, fallback)` 抹掉用户目录的那一步）。
 *
 * `isValid` 让 owner 声明「解析出来但形状不对也算读失败」：`null` / 数组 / 截断成半个对象的 JSON
 * 都是**合法 JSON**，按「读通了」处理就会在下一步被当成空配置，和解析失败是同一种损失。
 */
export function readConfigFile<T>(filePath: string, isValid?: (value: unknown) => boolean): ConfigFileReadResult<T> {
  const resolved = key(filePath);
  if (!fs.existsSync(resolved)) return { status: "missing" };
  try {
    const value = readJsonFile(resolved);
    if (isValid && !isValid(value)) throw new SyntaxError(`config file has an unusable shape: ${resolved}`);
    readFailures.delete(resolved);
    return { status: "ok", value: value as T };
  } catch (error) {
    const reason: ConfigReadFailureReason = error instanceof SyntaxError ? "corrupt" : "unreadable";
    const message = error instanceof Error ? error.message : String(error);
    const existing = readFailures.get(resolved);
    readFailures.set(resolved, {
      filePath: resolved,
      reason,
      message,
      quarantinedPath: existing?.quarantinedPath ?? null,
      at: existing?.at ?? new Date().toISOString(),
    });
    return { status: "failed", reason, message };
  }
}

/**
 * 把一份**读不出来的**配置改名留底，返回留底路径（没留成返回 null）。
 *
 * 只对 `corrupt` 动手：那份字节已经证明解析不了，留在原位只会让每次启动重复失败，改名之后
 * 下次启动走「文件不存在 → 建默认」这条唯一合法的写默认路径，而原始字节一个都没少。
 * `unreadable`（EBUSY/EPERM/EACCES/EIO）**不动**：那多半是杀软、索引器、云同步或并行实例
 * 拿了一下锁，几十毫秒后就好了，为它把用户的配置挪走是我们自己制造的损失。
 */
export function quarantineUnreadableConfigFile(filePath: string, at: Date = new Date()): string | null {
  const resolved = key(filePath);
  const existing = quarantines.get(resolved);
  if (existing?.quarantinedPath) return existing.quarantinedPath;
  const failure = readFailures.get(resolved);
  if (!failure || failure.reason !== "corrupt") return null;
  const target = withSuffix(resolved, `broken-${timestampSuffix(at)}`);
  try {
    renameSyncWithRetry(resolved, target);
  } catch {
    // 留不成底就维持现状：原文件还在原地，调用方仍然处在「不许写回」的状态里。
    return null;
  }
  readFailures.delete(resolved);
  quarantines.set(resolved, { ...failure, quarantinedPath: target });
  return target;
}

/**
 * 读不出来时的统一处置，所有配置 owner 共用这一条，不再各写一份 `try/catch { DEFAULT }`：
 * 损坏的改名留底后用默认值继续（原字节完整保留在留底文件里），只是打不开的**不碰文件**、
 * 本次用默认值跑，并把写禁令留在账本上——下一次写盘会被 `assertConfigFileWritable` 拦住。
 */
export function readConfigFileOrDefault<T>(
  filePath: string,
  fallback: () => T,
  isValid?: (value: unknown) => boolean,
): T {
  const outcome = readConfigFile<T>(filePath, isValid);
  if (outcome.status === "ok") return outcome.value;
  if (outcome.status === "failed") quarantineUnreadableConfigFile(filePath);
  return fallback();
}

/** 盘上那份还在、却读不出来 → 拒绝写。绝不拿默认值盖掉一份我们没读懂的用户配置。 */
export function assertConfigFileWritable(filePath: string): void {
  const failure = configReadFailure(filePath);
  if (!failure) return;
  throw new Error(
    `[config] refusing to write ${filePath}: the existing file could not be read ` +
      `(${failure.reason}: ${failure.message}). CONFIG_UNREADABLE_READ_ONLY — it is left untouched.`,
  );
}

const MAX_VERSION_BACKUPS = 3;

/**
 * 跨版本迁移前留一份带版本号的底。幂等：同一版本已经留过就不再留。
 *
 * 这条是「装了新版又装回旧版」唯一的解药——旧版读不懂新格式，但它能认领
 * `model-catalog.v9.bak.json`。日常写的 `.bak` 救不了这个场景：它会被之后每一次写覆盖掉。
 */
export function snapshotConfigVersion(filePath: string, version: number): string | null {
  const resolved = key(filePath);
  if (!fs.existsSync(resolved)) return null;
  const target = configVersionBackupPath(resolved, version);
  if (fs.existsSync(target)) return target;
  try {
    fs.copyFileSync(resolved, target);
  } catch {
    return null;
  }
  pruneVersionBackups(resolved);
  return target;
}

function pruneVersionBackups(filePath: string): void {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.v(\\d+)\\.bak${ext.replace(".", "\\.")}$`);
  try {
    const versions = fs
      .readdirSync(dir)
      .map((name) => ({ name, match: pattern.exec(name) }))
      .filter((entry): entry is { name: string; match: RegExpExecArray } => entry.match !== null)
      .map((entry) => ({ name: entry.name, version: Number(entry.match[1]) }))
      .sort((left, right) => right.version - left.version);
    for (const stale of versions.slice(MAX_VERSION_BACKUPS)) {
      fs.rmSync(path.join(dir, stale.name), { force: true });
    }
  } catch {
    // 清理旧备份失败不该阻断写盘——多留几份备份不是故障。
  }
}

/**
 * 配置落盘的唯一门：先把上一版轮转成 `.bak`，再走原子写。
 *
 * 轮转是 best-effort（拷贝失败不阻断写）——备份拿不到不是故障，而真正的保护是
 * 「读不出来就不许写」那一条，它在调用方的写门里（例如 catalogStore.writeCatalog）。
 */
export function writeConfigFileAtomic(
  filePath: string,
  value: unknown,
  options: WriteJsonFileAtomicOptions = {},
): void {
  const resolved = key(filePath);
  assertConfigFileWritable(resolved);
  if (fs.existsSync(resolved)) {
    try {
      fs.copyFileSync(resolved, configBackupPath(resolved));
    } catch {
      // 见上：备份是加分项，不是写盘的前置条件。
    }
  }
  writeJsonFileAtomic(resolved, value, options);
}
