import {
  DEFAULT_PROJECT_AGENT_APPROVAL_POLICY,
  PROJECT_AGENT_APPROVAL_MODES,
  PROJECT_AGENT_SPEND_POLICIES,
  type ProjectAgentApprovalMode,
  type ProjectAgentApprovalPolicy,
  type ProjectAgentSpendPolicy,
} from "../shared/agentCapabilities/capabilityApprovalPolicy";

/**
 * 「用户选的权限档」（每步问 / 自动改 / 全自动）在主进程这一份**权威值**的形状。
 *
 * 为什么它必须住在主进程：这一档是**用户设置**，不是某条 lane 的会话状态。此前它只住在渲染层
 * 的 `workbenchStore.projectAgentApprovalPolicy`，只经 Agent 面板 lane 的 composer 传进主进程；
 * 于是 ① 外部 MCP 宿主那条路从来读不到它（`generationTransportAdapters.ts` 原注释：「外部 MCP
 * 宿主那条路从来不传它」），用户明明选了「全自动」，外部 AI 仍然每一步问人；② 连 Agent 面板
 * 自己在刚打开项目、渲染层还没来得及把档位推上来的那一小段时间里，主进程持有的也是硬编码默认档。
 *
 * 词表本身不在这里定义——它的 owner 是 `shared/agentCapabilities/capabilityApprovalPolicy.ts`，
 * 这里只负责「持久化那一份」。归一化刻意保守：认不出的值一律回落到默认档（更常问，不会更少问）。
 */
export type AgentApprovalPolicySettings = {
  schemaVersion: 1;
  policy: ProjectAgentApprovalPolicy;
};

export const DEFAULT_AGENT_APPROVAL_POLICY_SETTINGS: AgentApprovalPolicySettings = Object.freeze({
  schemaVersion: 1,
  policy: DEFAULT_PROJECT_AGENT_APPROVAL_POLICY,
});

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeAgentApprovalPolicySettings(value: unknown): AgentApprovalPolicySettings {
  const raw = record(value);
  // 既接受 { schemaVersion, policy }，也接受裸的 { mode, spend }——写入口只有一个，但读的是盘上
  // 可能被手改过的文件，形状宽一点比整份丢掉诚实（丢掉 = 静默回到默认档，用户不会知道）。
  const candidate = record(raw.policy ?? raw);
  const mode = PROJECT_AGENT_APPROVAL_MODES.includes(candidate.mode as ProjectAgentApprovalMode)
    ? candidate.mode as ProjectAgentApprovalMode
    : DEFAULT_PROJECT_AGENT_APPROVAL_POLICY.mode;
  const spend = PROJECT_AGENT_SPEND_POLICIES.includes(candidate.spend as ProjectAgentSpendPolicy)
    ? candidate.spend as ProjectAgentSpendPolicy
    : DEFAULT_PROJECT_AGENT_APPROVAL_POLICY.spend;
  return { schemaVersion: 1, policy: { mode, spend } };
}
