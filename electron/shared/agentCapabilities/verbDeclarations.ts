// 模型可见动词的**唯一装配入口**。`modelFacingToolRegistry.ts` 只从这里读；lane、MCP、门岗都从注册表派生。
//
// **顺序是合同，不是审美**：目录顺序进系统提示词与 `tools/list`，是 prompt/KV-cache 的前缀
// （上游 `splitDeferredTools` 靠稳定前缀保住缓存）。按领域族固定拼，别按 `Object.keys` 之类会随实现漂的东西。
//
// 20 个动词（设计正本 §5）：7 读 + 13 写。常驻（无 `internalGroup`）的是用户每一轮都可能碰到的那些；
// 生成 / 时间轴 / 素材 / 维护 / 技能 / 模型 按组延迟披露。
import { MCP_NON_CONTRACT_TOOL_NAMES } from "./mcpTransportNames";
import { CAPABILITY_CONTRACTS } from "./registry";
import { isPaidBoundaryAlias } from "./paidBoundary";
import { assembleVerbDeclarations, type VerbDeclaration } from "./verbDeclaration";
import { onboardingVerbs } from "./verbs/onboardingVerbs";
import { readVerbs } from "./verbs/readVerbs";
import { writeVerbs } from "./verbs/writeVerbs";

export const VERB_DECLARATIONS: readonly VerbDeclaration[] = assembleVerbDeclarations({
  // 接模型那五条只投对外 profile（见 verbs/onboardingVerbs.ts 文件头），内部面仍是 20 个动词。
  declarations: [...readVerbs(), ...writeVerbs(), ...onboardingVerbs()],
  contractById: (id) => CAPABILITY_CONTRACTS.find((contract) => contract.id === id),
  isPaidBoundaryName: isPaidBoundaryAlias,
  // 只投对外 profile 的动词，说明书点名的是对外那一侧的名字（`nomi_read` …）。真相源仍是契约本身。
  mcpToolNames: [
    ...(CAPABILITY_CONTRACTS as readonly { aliases: { mcp?: string } }[])
      .flatMap((contract) => (contract.aliases.mcp ? [contract.aliases.mcp] : [])),
    ...MCP_NON_CONTRACT_TOOL_NAMES,
  ],
});
