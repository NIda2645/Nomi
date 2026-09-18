// 技能↔工具绑定门岗的判据本体（R17：判据住在 lib 里，才喂得进假仓库验「它会不会红」）。
//
// ── 守的不变量 ──
//
// **凡是能力注册表已经拥有的事实，技能正文一律不许复述。**
//
// 这条规则**有两个理由，缺一条都不足以解释它为什么是硬门岗**：
//
// ① **可移植性（这是目的）**——正文里焊死工具名与工具性质，技能就只能在 Nomi 里用。
//    我们自己那 88 个技能要拿得出去（09-07 开放战略：评估功能先问「更能被接、更能接别人吗」），
//    就不能写「调 `draft_shots`，它免费」这种只有 Nomi 听得懂的话。
//    同一条规则，ChatCut 的 `chatcut-skill-creator` 也给出了，原话是「不要写内部命令名」
//    「给现行工具留出演进空间」「宁可写『先剪最强的钩子』」——**规则对，但他们的执行方式是
//    不让用户自己造技能（`user-invocable: false`）。我们取规则，不取那份垄断。**
//
// ② **防复发（这是副产品）**——见下面的事故。
//
// 反过来，**外部装进来的技能一律不受这条门岗管**：拒收就是把我们的问题推给用户。
// 那一半在运行时解决（`agentContext.ts` 的权威节 + `foreignSkillPortability.test.ts`）。
//
// 2026-09-18 真机：用户让 Agent 照文稿出分镜，5 轮真模型 4 轮根本没调工具。
// 根因不是工具名写错了——`draft_shots` 名字完全正确、工具也在。坏的是
// `workbench-storyboard-planner/SKILL.md` 里一句**为上一代工具写的性质描述**：
//   :203（2026-06-13 为当时只读的 `propose_storyboard_plan` 写的）「绝不调用写画布/生成类工具」
//   :204（2026-09-14 之后）「调用 `draft_shots` 之前…」
// 而 `draft_shots` 正是 `generation.plan` / `reversible_write`——**:203 字面上禁止了 :204**，
// 模型服从了过期那条。
//
// 所以本门岗管的**不是工具名**（那归 `check:mcp-tool-references`，它已经在扫悬空名），
// 而是**性质**：读还是写、要不要先问用户、花不花钱、可不可逆。这四类事实每一条都住在
// `CapabilityContract` 上（`effect` / `effectClass` / `requiresPlanReview`），并且已经由
// `verbConsequence(effect, nextAction)`（`verbDeclaration.ts:140`，全仓只此一份）派生成
// 模型读到的后果句。技能正文里再写一遍，就是第二份**不会随注册表更新**的副本。
//
// ── 判据为什么不是「手抄一份名单」 ──
//
// 真相源只有一个：`resolveCapabilityAlias()`。工具叫什么、它是什么 effect，全部现查注册表，
// 本文件**一个工具名、一个 effect 值都没写死**。调用方把 `effectByAlias` 传进来。
//
// 下面的 `EFFECT_CLAIM_PATTERNS` 不是真相源的副本，是一个**中文断言检测器**——它回答
// 「这句话在断言某个工具的副作用性质吗」，不回答「这个工具到底是什么性质」。后者永远查注册表。
// 两者混在一起正是这条规则要防的病，所以这里写清楚。

/**
 * 断言「副作用性质」的中文措辞。四类与 `CapabilityContract` 的四类事实一一对应。
 *
 * **只认中文——这是一条带到期日的欠账，不是防线**（R17）：
 * 到期日 2026-12-18｜到期前替代品是运行时权威节（它不依赖任何措辞识别，所以模型这一层是兜住的，
 * 风险面只剩「我们自己仓库里一句英文复述能提交进来」）｜到期时怎么验它真能认英文：
 * 把下面三条阳性对照的事故文本逐句译成英文断言必红，再对 `skills/` 做一次英文变异要求 exit=1。
 * 全文见 `docs/plan/2026-09-18-portable-skill-tool-binding.md` §7.5.3。
 * 现在不做的理由：88 个技能全中文，英文判据一条真实样本都没有，没样本就验不了它会不会红。
 */
export const EFFECT_CLAIM_PATTERNS = Object.freeze([
  { kind: 'read_write', re: /只读|不写画布|写画布|不落画布|生成类工具|只产出方案对象/ },
  // 只认**描述工具自身行为**的说法。「用户确认方案后，用 X 落节点」是技能自己的阶段门，
  // 是它该写的内容，不是注册表事实——所以不认光秃秃的「用户确认后」。
  { kind: 'approval', re: /会走确认门|要用户确认|需要用户确认|用户点头才|确认后才(?:跑|生成|执行|调用)/ },
  { kind: 'money', re: /免费|不花钱|花钱|花额度|花任何额度|不提前花费|付费模型|报价卡|单价角标/ },
  { kind: 'reversible', re: /可改(?:的)?[，。、]|不可逆地?(?:写|改|落)/ },
])

/** 一行里出现的、能被注册表解析到的工具名。名字与 effect 都来自调用方给的注册表视图。 */
function toolsNamedIn(line, effectByAlias) {
  const named = []
  for (const alias of effectByAlias.keys()) {
    if (new RegExp(`\\b${alias}\\b`).test(line)) named.push(alias)
  }
  return named
}

/** 泛指工具的说法（「花钱的工具」「写画布/生成类工具」）——没点名具体工具，但一样在断言性质。 */
const GENERIC_TOOL_SUBJECT = /工具/

/**
 * 判一个技能文件。
 *
 * @param source     SKILL.md 全文
 * @param declaredTools 该技能 frontmatter 声明的工具名（空数组 ⇒ 整份跳过，见下）
 * @param effectByAlias Map<别名, effect>，**由 `resolveCapabilityAlias()` 派生**
 * @returns {{line:number, kind:string, tools:string[], text:string}[]}
 *
 * **只扫声明了工具的技能。** 这不是图省事，是判据的一部分：`writer-*` / `director-*` 这些
 * 创作方法论技能会在剧作意义上大量用「不可逆」「只读」（「角色做了不能撤回的事」「只读标记段落」），
 * 那是它们的专业词汇，不是在说工具。它们声明零个工具、也不点名任何工具，所以结构上就被排除，
 * **不需要任何豁免名单**——豁免名单的理由会过期，而这条结构判据不会。
 */
export function findEffectRestatements(source, declaredTools, effectByAlias) {
  if (declaredTools.length === 0) return []
  // 连 frontmatter 一起扫：`metadata.nomi.stages[].goal` 里同样写过「不落画布、不调用付费模型」
  // 这类性质断言（brand-promo / drama-short），它和正文里的那句一样会过期。
  const out = []
  for (const [index, line] of source.split('\n').entries()) {
    const claim = EFFECT_CLAIM_PATTERNS.find((pattern) => pattern.re.test(line))
    if (!claim) continue
    const named = toolsNamedIn(line, effectByAlias)
    // S1 点名了工具 + 断言了性质；S2 泛指「…的工具」+ 断言了性质（正是 :203 的形状）。
    if (named.length === 0 && !GENERIC_TOOL_SUBJECT.test(line)) continue
    out.push({ line: index + 1, kind: claim.kind, tools: named, text: line.trim() })
  }
  return out
}

/** frontmatter 的 `metadata.nomi.tools` 列表（纯文本读取，与门岗其余部分同源）。 */
export function declaredToolsOf(source) {
  // 列表项必须是「缩进 + `- ` + 名字」。不能写成 `\s*-\s*\S+`：那会把 frontmatter 的
  // 收尾 `---` 当成一个名叫 `--` 的工具吃进来（`tools:` 恰好是最后一个块时就会发生）。
  const block = /^[ \t]*tools:[ \t]*\n((?:[ \t]+- [^\s-][^\n]*\n)+)/m.exec(source)
  return block ? [...block[1].matchAll(/^[ \t]+- ([^\s]+)/gm)].map((match) => match[1]) : []
}

// ── 第五类注册表事实：字段该填什么值 ─────────────────────────────────────────
//
// 上面四类（名字 / 读写 / 审批 / 花钱）是 2026-09-18 前三次事故的形状。当天真机 23 轮又暴露了第五类，
// 而且上面那把尺子完全看不见它：
//
//   技能 `workbench-storyboard-planner/SKILL.md:69`：「`durationSec` 一律填 `0`」
//   动词 `writeVerbs.ts:33`：`z.number().positive()`，描述写的是「omit for stills」
//
// 模型照技能填了 `0`，被 ajv 当场拒——5 次失败全是这一条。它自己在回复里说破了：
// 「上次按图片分镜规范填了静帧时长，系统不接收」：**它知道自己照规范做的，但没法知道规范和工具对不上。**
//
// 判据刻意不去检测「有没有复述」，只检测「复述的东西是不是假的」：
// **技能给某个字段规定的字面值，必须能通过那个字段自己的 schema。**
// 值能过就一声不吭，所以举合法例子、写示例参数不会被误伤。
//
// **但它不是零误报的**——我第一版这么宣称过，门岗第一次跑就证伪了：
// 「用户已指定模型或清晰度时才填（从 `list_models` 取准确值）」里的 `list_models` 是**工具名**，
// 被归给了前面最近的 `parameters`，而 object schema 收不下字符串 → 假红。
// 所以裸标识符要先排掉「它其实是个工具名/字段名」的情况（见 `isReference`）。
// 数字、布尔、带引号的串没有这个歧义，照测。
//
// 归属规则：一个字面值归**它前面最近的那个字段**。少了这条，
// 「`taskKind` 填 `text_to_image`，`durationSec` 省掉」里的 `text_to_image` 会被拿去喂 durationSec 的
// schema（不是数字 → 假红）。按字段出现位置切段，每段只喂本段的值。

/**
 * 反引号里的字面量 → JS 值。认不出的返回 `undefined`（=不参与判定，宁可漏报不误报）。
 *
 * `known` 是「这一带认识的名字」：工具名与字段名。裸标识符同时可能是**枚举值**（`text_to_image`）
 * 和**引用**（`list_models`、`operationId`），光看形状分不开——在 `known` 里的一律当引用排掉。
 * 代价是枚举值里恰好与某个字段/工具同名的那些测不到；换来的是不会把「从 X 取值」读成「填 X」。
 */
function literalValueOf(text, known) {
  const raw = text.trim()
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw)
  if (raw === 'true' || raw === 'false') return raw === 'true'
  if (/^["'].*["']$/.test(raw)) return raw.slice(1, -1)
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(raw)) return known.has(raw) ? undefined : raw
  return undefined
}

/**
 * 取一个 schema 节点的字段表（`.shape`），**剥掉包在外面的壳**。
 *
 * 为什么要剥：`superRefine` / `optional` / `default` 会把 ZodObject 包成别的类型，
 * 包完之后 `.shape` 就没了。第一版直接读 `node.shape`，于是 20 个动词里有 6 个
 * 派生出 0 个字段——判据对它们完全空转，却仍然报绿。绿是因为什么都没看。
 *
 * @param node 任意 schema 节点
 * @returns 字段表，取不到返回 undefined
 */
export function objectShapeOf(node) {
  let cur = node
  for (let i = 0; i < 8 && cur; i += 1) {
    if (cur.shape) return cur.shape
    cur = cur._def?.schema ?? cur._def?.innerType ?? cur._def?.type ?? cur.unwrap?.()
  }
  return undefined
}

/**
 * 判一个技能文件里有没有「给字段规定了一个 schema 不认的值」。
 *
 * @param source SKILL.md 全文
 * @param declaredTools frontmatter 声明的工具名（空 ⇒ 整份跳过，与上面同一条结构判据）
 * @param fieldSchemas Map<工具名, Map<字段名, {safeParse(value)}>> —— **由动词声明派生**，不在这里抄第二份
 * @returns {{line:number, tool:string, field:string, value:unknown, text:string}[]}
 */
export function findFalseFieldValues(source, declaredTools, fieldSchemas) {
  if (declaredTools.length === 0) return []
  const fields = new Map()
  for (const tool of declaredTools) {
    for (const [name, schema] of fieldSchemas.get(tool) ?? []) {
      if (!fields.has(name)) fields.set(name, { tool, schema })
    }
  }
  if (fields.size === 0) return []
  // 这一带认识的名字：所有工具名 + 所有字段名。裸标识符命中它就是引用，不是规定的值。
  const known = new Set([...fields.keys()])
  for (const tool of fieldSchemas.keys()) known.add(tool)
  const out = []
  for (const [index, line] of source.split('\n').entries()) {
    // 按「反引号里的字段名」把整行切段：每段属于它开头那个字段，段内的字面量才算它的。
    const marks = [...line.matchAll(/`([A-Za-z_][A-Za-z0-9_.]*)`/g)]
      .filter((match) => fields.has(match[1].split('.').pop()))
    for (const [order, mark] of marks.entries()) {
      const field = mark[1].split('.').pop()
      const from = mark.index + mark[0].length
      const to = order + 1 < marks.length ? marks[order + 1].index : line.length
      for (const literal of line.slice(from, to).matchAll(/`([^`]+)`/g)) {
        const value = literalValueOf(literal[1], known)
        if (value === undefined) continue
        const { tool, schema } = fields.get(field)
        if (schema.safeParse(value).success) continue
        out.push({ line: index + 1, tool, field, value, text: line.trim() })
      }
    }
  }
  return out
}
