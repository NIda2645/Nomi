import path from "node:path";

import { readJsonFile, writeJsonFileAtomic } from "../jsonFile";
import { getSettingsRoot } from "./settingsRoot";
import {
  DEFAULT_AGENT_APPROVAL_POLICY_SETTINGS,
  normalizeAgentApprovalPolicySettings,
  type AgentApprovalPolicySettings,
} from "./agentApprovalPolicyContract";
import type { ProjectAgentApprovalPolicy } from "../shared/agentCapabilities/capabilityApprovalPolicy";

export {
  DEFAULT_AGENT_APPROVAL_POLICY_SETTINGS,
  normalizeAgentApprovalPolicySettings,
  type AgentApprovalPolicySettings,
} from "./agentApprovalPolicyContract";

const AGENT_APPROVAL_POLICY_FILE = "agent-approval-policy.json";

export function agentApprovalPolicySettingsPath(): string {
  return path.join(getSettingsRoot(), AGENT_APPROVAL_POLICY_FILE);
}

/** 主进程侧「用户现在选的权限档」的**唯一**读口。缺文件/读坏 = 默认档（更常问的那一档）。 */
export function readAgentApprovalPolicy(): ProjectAgentApprovalPolicy {
  try {
    return normalizeAgentApprovalPolicySettings(readJsonFile(agentApprovalPolicySettingsPath())).policy;
  } catch {
    return DEFAULT_AGENT_APPROVAL_POLICY_SETTINGS.policy;
  }
}

/**
 * 写口同样只有一个：用户在 Agent 面板切档 → 渲染层沿**已有的** lane composer IPC 把新档位推进
 * 主进程（`laneDesktopRuntime.updatePolicy` / `configure`）→ 那里落盘。不新增设置界面、不新增 IPC。
 */
export function writeAgentApprovalPolicy(value: unknown): ProjectAgentApprovalPolicy {
  const next = normalizeAgentApprovalPolicySettings(value);
  writeJsonFileAtomic(agentApprovalPolicySettingsPath(), next);
  return next.policy;
}
