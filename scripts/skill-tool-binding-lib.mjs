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

/** 断言「副作用性质」的中文措辞。四类与 `CapabilityContract` 的四类事实一一对应。 */
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
