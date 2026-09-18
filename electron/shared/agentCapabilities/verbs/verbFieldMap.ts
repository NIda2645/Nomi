// 动词字段 → 宿主字段的**对应关系本身**，作为数据。
//
// ── 它在解决哪个真实摩擦 ──
//
// 一个能力在这条链上被重述四遍：动词声明（模型看的）、翻译层、契约 schema（宿主收的）、handler 及下游投影。
// 头两遍该有——模型要的是对它友好的形状（`durationSec` 摆在顶层），宿主要的是内部形状
// （`parameters.duration`），而且宿主那道校验是跨进程 + 花钱闸的准入规定，必须独立存在。
// 第三遍**不该手写**：它承载的全部信息，就是前两套词之间的对应关系。
//
// **2026-09-18：这张表上「模型面叫 A、宿主面叫 B」那一类已经全部消掉了**（改的是模型面）。剩下的
// `rename` 都有领域理由：改嵌套层级、拍平嵌套，或者一个字段真的对着两个域的两份持久化（`jobId`）。
// 加新的 `rename` 前先问一句：这条的理由是领域约束，还是只是「我们这边习惯叫另一个名字」。
//
// 手写它的代价在 2026-09-18 量到过：`durationSec` 被改名成一个宿主没有的顶层字段（整条拒收）、
// 平铺的模型字段与逐镜 `candidate.providerId/modelId` 在解构里根本没被列出来（**静默**丢掉，模型点名
// 「用 apimart 的 image-1」，宿主照用户默认模型去花钱）。两种病因是同一个：**对应关系只存在于一段
// 手写代码里，没有任何东西能核对它是否完整、是否指向真实存在的宿主字段。**
//
// 这个文件把对应关系收成一张表，翻译函数与一致性断言都从它来：
//   · 动词加了字段而没加对应关系 → 装配期抛（不是运行时静默丢）
//   · 对应关系指向宿主不存在的字段 → 装配期抛
//   · 两条对应关系抢同一个宿主字段而没分优先级 → 装配期抛（`shots[].modelId` 与 `shots[].candidate.modelId` 就是这一对）
//
// ── 一条纪律：有损的那一档必须显式 ──
//
// 参考素材是 `string[]`（assetId）进、`{assetId, contentHash, version}[]` 出——形状变了，身份由宿主补。
// 这种关系**不许写成同名透传**，必须声明成 `resolved` 并写清由谁补、为什么模型给不出。
// 静默透传正是这一整类缺陷的病根。
import type { ZodTypeAny } from "zod";

/**
 * 一个字段在某个宿主形状上**没有位置**时怎么办。这里不许有缺省——
 * 「宿主收不下」与「可以丢」是两件完全不同的事，而它们长得一模一样（都是「值没过去」）。
 *   · `refuse` 当场抛：模型填了它，而这条路送不到；静默丢掉就是今天这一整类缺陷的形状。
 *   · `drop`   有意丢，`why` 要写清被谁吃掉、用户怎么仍然知道发生了什么。
 *   · `lift`   它不是这个形状里的字段，是**包着这个形状的信封**上的字段（寻址：改多镜草稿里的哪一镜）。
 *              值提到信封的 `to` 上，由 `liftedByFieldMap` 执行；父表（`elements` 的持有者）在装配期核
 *              `to` 真在它同名目标形状上——信封上没有这个位置，提上来也送不到，那就当场抛。
 */
export type VerbFieldAbsence =
  | Readonly<{ disposition: "refuse" | "drop"; why: string }>
  | Readonly<{ disposition: "lift"; to: string; why: string }>;

/**
 * 这个值**模型是从哪拿到的**。四档，没有缺省——留空就是没想过。
 *
 * 为什么必须有这一轴：前一条不变量（宿主要的，动词得告诉过模型）只覆盖一半。反例：宿主要
 * `contentHash`，有人直接把 `contentHash` 加进动词声明——「告诉过模型」立刻成立，可模型还是拿不到，
 * 因为**没有任何读动词返回它**。工具照样 100% 不可用，而且没有任何东西会红。
 * 判据一句话：宿主每个必填字段，都要说得出模型从哪拿到它；说不出就是设计错了，不是模型的问题。
 *
 *   · `model-authored`          模型自己写得出（自由文本、它的选择、枚举里挑一个）
 *   · `from-read:<verb>.<field>` 某个动词的返回里有它——**这一档机器核**：那个动词的输出 schema 里
 *                                真的得有这个字段，没有就红
 *   · `host-resolved`           宿主自己解析，根本不问模型（参考素材的身份就是这一档）
 *   · `derived:<field>`         从同一次调用里别的字段算出来
 */
export type VerbFieldProvenance = string;
const PROVENANCE = /^(model-authored|host-resolved|from-read:[a-z_]+\.[A-Za-z_][A-Za-z0-9_]*|derived:[A-Za-z_][A-Za-z0-9_.]*)$/;

/** 一条关系声明的来源（可以有多档：参考素材是「模型给 assetId」+「宿主补身份」）。 */
export function provenanceOf(relation: VerbFieldRelation): readonly VerbFieldProvenance[] | undefined {
  return (relation as { from?: readonly VerbFieldProvenance[] }).from;
}

/** `from-read:` 那一档指向谁。 */
export function readProvenanceTargets(relation: VerbFieldRelation): ReadonlyArray<{ verb: string; field: string }> {
  return (provenanceOf(relation) ?? [])
    .filter((entry) => entry.startsWith("from-read:"))
    .map((entry) => {
      const [verb, field] = entry.slice("from-read:".length).split(".");
      return { verb: verb!, field: field! };
    });
}

/** 一个字段在这条链上的去向。`kind` 是声明，不是注释：执行器按它走，装配期按它核。 */
export type VerbFieldRelation =
  /**
   * 同名透传。`priority` 与 `rename` 上那个同义：两条关系落在同一个宿主字段上时，谁赢必须是**声明**
   * 出来的。（`draft_shots` 的 `shots[].modelId` 与 `shots[].candidate.modelId` 就是这样一对——
   * 名字统一之后平铺那条成了 `same`，但它和 `candidate` 那条仍然抢同一个落点。）
   */
  | Readonly<{ kind: "same"; from: readonly VerbFieldProvenance[]; priority?: number; absentOn?: Readonly<Record<string, VerbFieldAbsence>> }>
  /** 改名。`to` 可以是点号路径（`parameters.duration`），落进宿主那个嵌套记录里。 */
  | Readonly<{ kind: "rename"; to: string; why: string; from: readonly VerbFieldProvenance[]; priority?: number; absentOn?: Readonly<Record<string, VerbFieldAbsence>> }>
  /**
   * **有损**：形状变了，缺的那部分由宿主补。`by` 写清谁补、补什么，`why` 写清模型为什么给不出。
   * 这一档存在的意义就是不让它看起来像同名透传。
   */
  | Readonly<{ kind: "resolved"; to: string; by: string; why: string; from: readonly VerbFieldProvenance[]; absentOn?: Readonly<Record<string, VerbFieldAbsence>> }>
  /** 父对象本身不下传，由列出的子路径承载。子路径必须各自有自己的关系，少一条即抛。 */
  | Readonly<{ kind: "expanded"; into: readonly string[]; why: string }>
  /** 顶层缺省：折进某个数组字段的每一项；逐项自己写的值优先。 */
  | Readonly<{ kind: "defaults"; into: string; why: string; from: readonly VerbFieldProvenance[] }>
  /** 数组字段：逐项按子表翻。 */
  | Readonly<{ kind: "elements"; map: VerbFieldMap; why: string }>
  /** 被翻译吃掉，且**有理由**（选分支、被方法名承载…）。理由为空即抛。 */
  | Readonly<{ kind: "consumed"; why: string }>;

export interface VerbFieldMapInput {
  /** 出现在报错里的名字，例如 `draft_shots.shots[] → generation plan shot`。 */
  readonly label: string;
  /** 源字段名单。**从动词自己的 schema 取**，不许手抄。 */
  readonly sourceKeys: readonly string[];
  /** 目标名 → 那个宿主形状的字段名单。同样从宿主 schema 取。 */
  readonly targets: Readonly<Record<string, readonly string[]>>;
  readonly relations: Readonly<Record<string, VerbFieldRelation>>;
}

export interface VerbFieldMap extends VerbFieldMapInput {
  readonly targetNames: readonly string[];
}

const rootOf = (path: string): string => path.split(".")[0]!;

/** 关系落到宿主的哪个路径（`consumed` / `expanded` / `defaults` / `elements` 没有落点）。 */
function targetPathOf(source: string, relation: VerbFieldRelation): string | undefined {
  switch (relation.kind) {
    case "same": return source;
    case "rename": case "resolved": return relation.to;
    default: return undefined;
  }
}

function priorityOf(relation: VerbFieldRelation): number {
  return relation.kind === "rename" || relation.kind === "same" ? relation.priority ?? 0 : 0;
}

/**
 * 装配一张对应表：五条不变量当场跑，任何一条不满足就抛。
 * 这些检查**不能**降级成门岗——它们是「这张表自洽吗」，表不自洽时生成出来的翻译就是错的。
 */
export function assembleVerbFieldMap(input: VerbFieldMapInput): VerbFieldMap {
  const { label, sourceKeys, targets, relations } = input;
  const targetNames = Object.keys(targets);
  if (targetNames.length === 0) throw new Error(`${label}: 一张对应表至少要有一个目标形状`);

  // ① 每个源字段都要有关系——**少一条就是一次静默丢弃**，这正是 `candidate.providerId` 当初消失的方式。
  const declaredRoots = new Set(Object.keys(relations).map(rootOf));
  for (const key of sourceKeys) {
    if (!declaredRoots.has(key)) {
      throw new Error(`${label}: 动词字段 "${key}" 没有对应关系。补一条（same / rename / resolved / consumed…），`
        + "别让它悄悄消失——翻译层漏列一个字段不报错，只是模型填的东西到不了宿主。");
    }
  }
  // ② 关系的源字段必须真的存在于动词 schema 上（改名之后残留的关系会在这里被抓到）。
  for (const source of Object.keys(relations)) {
    if (!sourceKeys.includes(rootOf(source))) {
      throw new Error(`${label}: 对应关系写了 "${source}"，但动词 schema 上没有 "${rootOf(source)}"`);
    }
  }
  // ③ `expanded` 列出的子路径必须各自有关系（删掉其中一条 = 那个子字段静默消失）。
  for (const [source, relation] of Object.entries(relations)) {
    if (relation.kind !== "expanded") continue;
    if (relation.into.length === 0) throw new Error(`${label}: "${source}" 声明成 expanded 却没列出承载它的子路径`);
    for (const child of relation.into) {
      if (!relations[child]) {
        throw new Error(`${label}: "${source}" 说它由 "${child}" 承载，但 "${child}" 没有自己的对应关系——`
          + "这条一旦缺失，那个子字段就会被静默丢掉（2026-09-18 的 providerId 就是这么没的）。");
      }
    }
  }
  // ③' 子表里声明成 `lift` 的字段，落点必须真在**本表**同名目标形状上（它就是那层信封）。
  //    信封上没有这个位置，提上来也送不到——和「宿主没有这个字段」是同一种病，同样在装配期抛。
  for (const [source, relation] of Object.entries(relations)) {
    if (relation.kind !== "elements") continue;
    for (const [child, childRelation] of Object.entries(relation.map.relations)) {
      const absentOn = (childRelation as { absentOn?: Readonly<Record<string, VerbFieldAbsence>> }).absentOn ?? {};
      for (const [target, absence] of Object.entries(absentOn)) {
        if (absence.disposition !== "lift") continue;
        if (absence.to.includes(".") || !absence.to.trim()) {
          throw new Error(`${label}: "${source}[].${child}" 的 lift 落点 "${absence.to}" 必须是信封上的一个顶层字段`);
        }
        if (!targets[target]?.includes(absence.to)) {
          throw new Error(`${label}: "${source}[].${child}" 说它在目标 "${target}" 上要提到信封的 "${absence.to}"，`
            + `但本表的 "${target}" 形状没有 "${absence.to}"——信封上没有这个位置，提上来也送不到。`);
        }
      }
    }
  }
  // ④ 落点必须在宿主那个形状里真的存在；不存在就必须在 `absentOn` 里按目标具名登记并写清理由。
  for (const [source, relation] of Object.entries(relations)) {
    const path = targetPathOf(source, relation);
    if (path === undefined) {
      if ((relation.kind === "consumed" || relation.kind === "expanded" || relation.kind === "defaults" || relation.kind === "elements")
        && !relation.why.trim()) {
        throw new Error(`${label}: "${source}" 的 ${relation.kind} 没写理由——没有理由的丢弃与忘记写没有区别`);
      }
      continue;
    }
    if (relation.kind === "resolved" && (!relation.by.trim() || !relation.why.trim())) {
      throw new Error(`${label}: "${source}" 是有损对应（resolved），必须写清 by（谁来补）与 why（模型为什么给不出）`);
    }
    for (const target of targetNames) {
      if (targets[target]!.includes(rootOf(path))) continue;
      const absence = relation.kind === "same" || relation.kind === "rename" || relation.kind === "resolved"
        ? relation.absentOn?.[target]
        : undefined;
      if (!absence || !absence.why.trim()) {
        throw new Error(`${label}: "${source}" 要落在宿主的 "${path}" 上，但目标形状 "${target}" 没有 "${rootOf(path)}"。`
          + `要么改对应关系，要么在 absentOn.${target} 里写清处置（refuse 还是 drop）与理由。`);
      }
    }
  }
  // ⑥ 每条带值的关系都要说清模型从哪拿到它。留空 = 没想过，而「没想过」正是
  //    「宿主要一个模型根本拿不到的字段」能一路活到付费运行的那条缝。
  for (const [source, relation] of Object.entries(relations)) {
    if (!["same", "rename", "resolved", "defaults"].includes(relation.kind)) continue;
    const from = provenanceOf(relation);
    if (!from || from.length === 0) {
      throw new Error(`${label}: "${source}" 没声明来源（from）。模型从哪拿到这个值？`
        + "四档选一：model-authored / from-read:<动词>.<字段> / host-resolved / derived:<字段>。");
    }
    for (const entry of from) {
      if (!PROVENANCE.test(entry)) throw new Error(`${label}: "${source}" 的来源 "${entry}" 不是合法的一档`);
    }
  }
  // ⑤ 同一个目标上两条关系抢同一个落点，必须分出优先级（`shots[].modelId` 与 `candidate.modelId` 就是一对）。
  for (const target of targetNames) {
    const byPath = new Map<string, Array<{ source: string; priority: number }>>();
    for (const [source, relation] of Object.entries(relations)) {
      const path = targetPathOf(source, relation);
      if (path === undefined || !targets[target]!.includes(rootOf(path))) continue;
      byPath.set(path, [...(byPath.get(path) ?? []), { source, priority: priorityOf(relation) }]);
    }
    for (const [path, writers] of byPath) {
      if (writers.length < 2) continue;
      const priorities = new Set(writers.map((writer) => writer.priority));
      if (priorities.size !== writers.length) {
        throw new Error(`${label}: ${writers.map((w) => `"${w.source}"`).join(" 与 ")} 都落在 "${path}"（目标 ${target}）`
          + "，却没有分出优先级。谁赢必须是声明出来的，不是靠写在前面还是后面。");
      }
    }
  }
  return Object.freeze({ ...input, targetNames });
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined
  ), source);
}

/** 参考素材那一档的补全器：assetId 串 → 宿主认的引用形状（身份仍由宿主在自己那侧钉死）。 */
export type VerbFieldResolvers = Readonly<Record<string, (value: unknown) => unknown>>;

/**
 * 按对应表把一份动词参数翻成宿主参数。**没有任何字段名写在这个函数里**——它只会执行表。
 *
 * 落点合并规则：整键写入先发生，点号路径再并进那个对象。于是 `parameters` 与
 * `durationSec → parameters.duration` 的关系与手写版逐字节一致，而不必再写一次那句 spread。
 */
export function projectByFieldMap(
  source: Record<string, unknown>,
  map: VerbFieldMap,
  target: string,
  resolvers: VerbFieldResolvers = {},
): Record<string, unknown> {
  if (!map.targets[target]) throw new Error(`${map.label}: 没有名为 "${target}" 的目标形状`);
  const keys = map.targets[target]!;
  const whole: Array<{ path: string; value: unknown; priority: number }> = [];
  const nested: Array<{ path: string; value: unknown; priority: number }> = [];
  for (const [sourcePath, relation] of Object.entries(map.relations)) {
    const path = targetPathOf(sourcePath, relation);
    if (path === undefined) continue;
    const raw = readPath(source, sourcePath);
    if (!keys.includes(rootOf(path))) {
      // 这个形状上没有它的位置。**填了却送不到**必须当场说出来——除非表里明写了这是有意丢弃，
      // 或者它是信封上的字段（`lift`：由 `liftedByFieldMap` 提到包着这个形状的那层去）。
      const absence = (relation as { absentOn?: Readonly<Record<string, VerbFieldAbsence>> }).absentOn?.[target];
      if (raw !== undefined && absence?.disposition === "refuse") {
        throw Object.assign(
          new Error(`${map.label}: "${sourcePath}" 在这条路上送不到宿主（${absence.why}）`),
          { code: "capability_input_invalid" },
        );
      }
      continue;
    }
    if (raw === undefined) continue;
    const value = relation.kind === "resolved"
      ? (resolvers[sourcePath] ?? ((input: unknown) => input))(raw)
      : raw;
    if (value === undefined) continue;
    (path.includes(".") ? nested : whole).push({ path, value, priority: priorityOf(relation) });
  }
  const out: Record<string, unknown> = {};
  const winners = new Map<string, { value: unknown; priority: number }>();
  for (const write of whole) {
    const current = winners.get(write.path);
    if (!current || write.priority > current.priority) winners.set(write.path, write);
  }
  for (const [path, write] of winners) out[path] = write.value;
  for (const write of nested) {
    const [head, ...rest] = write.path.split(".");
    const container = out[head!];
    const base = container && typeof container === "object" && !Array.isArray(container)
      ? { ...(container as Record<string, unknown>) }
      : {};
    let cursor = base;
    for (const key of rest.slice(0, -1)) {
      const next = cursor[key];
      cursor[key] = next && typeof next === "object" && !Array.isArray(next) ? { ...(next as Record<string, unknown>) } : {};
      cursor = cursor[key] as Record<string, unknown>;
    }
    cursor[rest[rest.length - 1]!] = write.value;
    out[head!] = base;
  }
  return out;
}

/**
 * `lift` 那一档的执行器：这个目标形状上没位置、要提到**信封**上的字段 → `{ [to]: value }`。
 * 调用方把它 spread 进包着这个形状的那层（`draft_shots` 改草稿：一镜的 `shotId` 提到 plan patch 的信封上）。
 * 同样没有任何字段名写在这里。
 */
export function liftedByFieldMap(
  source: Record<string, unknown>,
  map: VerbFieldMap,
  target: string,
): Record<string, unknown> {
  if (!map.targets[target]) throw new Error(`${map.label}: 没有名为 "${target}" 的目标形状`);
  const out: Record<string, unknown> = {};
  for (const [sourcePath, relation] of Object.entries(map.relations)) {
    const absence = (relation as { absentOn?: Readonly<Record<string, VerbFieldAbsence>> }).absentOn?.[target];
    if (absence?.disposition !== "lift") continue;
    const raw = readPath(source, sourcePath);
    if (raw !== undefined) out[absence.to] = raw;
  }
  return out;
}

/** 顶层缺省折进数组每一项：逐项自己写的值优先（`defaults` 那一档的执行器）。 */
export function applyDefaultsByFieldMap(
  args: Record<string, unknown>,
  map: VerbFieldMap,
  element: Record<string, unknown>,
): Record<string, unknown> {
  let next = element;
  for (const [sourcePath, relation] of Object.entries(map.relations)) {
    if (relation.kind !== "defaults") continue;
    const value = readPath(args, sourcePath);
    if (value === undefined || next[sourcePath] !== undefined) continue;
    next = { ...next, [sourcePath]: value };
  }
  return next;
}

/** 从一份 zod 对象 schema 取字段名单。源名单与目标名单都从这里来——**不许手抄第二份**。 */
export function objectFieldKeys(schema: ZodTypeAny, label: string): readonly string[] {
  let node: unknown = schema;
  for (let depth = 0; depth < 8; depth += 1) {
    const def = (node as { _def?: Record<string, unknown> })._def;
    const shape = (node as { shape?: Record<string, unknown> }).shape;
    if (shape && typeof shape === "object") return Object.freeze(Object.keys(shape));
    if (!def) break;
    const inner = def.innerType ?? def.type ?? def.schema;
    if (!inner) break;
    node = inner;
  }
  throw new Error(`objectFieldKeys(${label}): 这不是一份能取出字段名单的对象 schema`);
}
