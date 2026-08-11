export const PRODUCTION_RUN_SCHEMA_VERSION = 1;

export type AutomationMode = "guided" | "balanced" | "policy-auto";

/**
 * B3 信任档位（run 级，写进 policy 可查证）——决定「创意门 / 样片门」打不打扰，钱门永不受影响：
 * - key_confirm（默认）：五门全开——方向门 + 样片门都停，用户逐项拍板。
 * - budget_only：跳过创意门与样片门（自动批准、事件留痕），只留预算门与不可逆动作。「别问了直接出」= 降到这档。
 * - confirm_all：控制欲最强——每镜提交前都停（本期仅埋事件钩子，不实现每镜门，见 plan 范围）。
 * 预算门（budget_envelope）任何档位都不跳。
 */
export type TrustLevel = "key_confirm" | "budget_only" | "confirm_all";

export const DEFAULT_TRUST_LEVEL: TrustLevel = "key_confirm";

const TRUST_LEVELS: readonly TrustLevel[] = ["key_confirm", "budget_only", "confirm_all"];

/** B3：把任意输入收敛成合法档位（非法/缺省 → key_confirm）。单一收口，别在各处硬编码判断。 */
export function normalizeTrustLevel(value: unknown): TrustLevel {
  return TRUST_LEVELS.includes(value as TrustLevel) ? (value as TrustLevel) : DEFAULT_TRUST_LEVEL;
}

/** 读一个 run 的有效档位（老 run 无字段 → 默认）。 */
export function trustLevelOf(policy: Pick<AutomationPolicy, "trustLevel">): TrustLevel {
  return normalizeTrustLevel(policy.trustLevel);
}

export type AutomationPolicy = {
  mode: AutomationMode;
  trustedHosts: string[];
  allowedProviders: string[];
  allowedModels: string[];
  maxSpend: number | null;
  maxAttemptsPerJob: number;
  minimizeUploads: boolean;
  /** B3 信任档位。老 run 文件无此字段 → 读作默认 key_confirm（向后兼容）。 */
  trustLevel?: TrustLevel;
};

export type BudgetLedgerSummary = {
  currency: string;
  authorized: number;
  reserved: number;
  actual: number;
  unsettled: number;
};

export type ProductionRunStatus =
  | "draft"
  | "awaiting_direction"
  | "awaiting_storyboard_review"
  | "awaiting_contract"
  | "ready"
  | "running"
  | "pausing"
  | "paused"
  | "needs_attention"
  | "awaiting_rough_cut_review"
  | "awaiting_export"
  | "exporting"
  | "completed"
  | "cancelled";

export type ProductionJobStatus =
  | "planned"
  | "authorization_required"
  | "authorized"
  | "submit_intent_persisted"
  | "submitting"
  | "provider_accepted"
  | "polling"
  | "retry_wait"
  | "downloading"
  | "validating_technical"
  | "validating_content"
  | "ready"
  | "adopted"
  | "submission_unknown"
  | "reconciling"
  | "needs_attention"
  | "cancel_requested"
  | "cancelled_remote"
  | "detached"
  | "too_late";

export type ProductionStageStatus =
  | "pending"
  | "running"
  | "awaiting_gate"
  | "completed"
  | "needs_attention"
  | "cancelled";

export type ProductionGateStatus = "waiting" | "approved" | "rejected" | "expired" | "revoked";

export type ProductionContract = {
  specs: {
    durationSeconds?: number;
    aspectRatio?: string;
    language?: string;
    shotCount?: number;
  };
  claims: Array<{ text: string; evidenceIds: string[] }>;
  evidence: Array<{ evidenceId: string; label: string; projectRelativePath?: string }>;
  skills: Array<{ name: string; version: string }>;
  estimatedCost?: { currency: string; minimum: number; maximum: number };
};

export type ProductionBrief = {
  goal: string;
  audience?: string;
  channel?: string;
  tone?: string;
  durationSeconds?: number;
  sellingPoints?: string[];
  referenceArtifactIds?: string[];
};

export type ProductionStage = {
  stageId: string;
  title: string;
  status: ProductionStageStatus;
  order: number;
  startedAt?: string;
  completedAt?: string;
};

export type ProductionJob = {
  jobId: string;
  stageId: string;
  status: ProductionJobStatus;
  attempt: number;
  provider: string;
  model: string;
  idempotencyKey: string;
  providerTaskId?: string;
  taskKind?: string;
  nodeId?: string;
  progressPercent?: number;
  lastPollAt?: string;
  lastVendorStateChangeAt?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * B1 创意方向候选：AI 拟的一句话方向，用户在对话/面板里三选一（或「都不要，自己描述」）。
 * key = 稳定选项标识（决议时回填进事件留痕）；oneLiner = 一句话描述（用户可读，走 i18n 转述）。
 */
export type ProductionDirectionCandidate = {
  key: string;
  title: string;
  oneLiner: string;
};

export type ProductionGate = {
  gateId: string;
  scope: "stage" | "job_set" | "budget_envelope" | "export" | "publish";
  status: ProductionGateStatus;
  planHash: string;
  jobIds: string[];
  title: string;
  summary: string;
  contract?: ProductionContract;
  /** B1：方向门候选（仅 gate-direction-*）。driver 拟好后 gate.set_candidates 挂上，投影透出。 */
  directionCandidates?: ProductionDirectionCandidate[];
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
  /** B1：方向门被批准时用户选中的候选 key（decide payload choiceKey → 事件留痕）。 */
  decidedChoiceKey?: string;
};

export type ProductionArtifact = {
  artifactId: string;
  stageId: string;
  jobId?: string;
  kind: "brief" | "direction" | "script" | "storyboard" | "image" | "video" | "audio" | "timeline" | "export";
  status: "candidate" | "ready" | "adopted" | "rejected";
  projectRelativePath?: string;
  thumbnailRelativePath?: string;
  createdAt: string;
  adoptedAt?: string;
};

export type ProductionRun = {
  schemaVersion: number;
  runId: string;
  projectId: string;
  revision: number;
  status: ProductionRunStatus;
  stageId: string;
  playbook: { name: string; version: string };
  origin: { host: string; actorId?: string };
  brief?: ProductionBrief;
  policy: AutomationPolicy;
  budget: BudgetLedgerSummary;
  planVersion: number;
  snapshotCursor: number;
  stages: ProductionStage[];
  gates: ProductionGate[];
  jobs: ProductionJob[];
  artifacts: ProductionArtifact[];
  createdAt: string;
  updatedAt: string;
};

export type ProductionRunSummary = Pick<
  ProductionRun,
  "runId" | "projectId" | "revision" | "status" | "stageId" | "playbook" | "origin" | "budget" | "updatedAt"
>;

export type CreateProductionRunInput = {
  runId?: string;
  projectId: string;
  playbook: { name: string; version: string };
  origin: { host: string; actorId?: string };
  brief?: ProductionBrief;
  policy?: Partial<AutomationPolicy>;
  currency?: string;
};

export type Approval = {
  approvalId: string;
  runId: string;
  scope: ProductionGate["scope"];
  planHash: string;
  jobIds: string[];
  allowedProviders: string[];
  allowedModels: string[];
  currency: string;
  maxSpend: number;
  maxAttemptsPerJob: number;
  decidedAt: string;
  expiresAt: string;
  revokedAt?: string;
};

export type RunEvent = {
  schemaVersion: number;
  eventId: string;
  cursor: number;
  runId: string;
  runRevision: number;
  commandId: string;
  type: string;
  message: string;
  emittedAt: string;
  stageId?: string;
  jobId?: string;
  artifactId?: string;
  causationId?: string;
  correlationId?: string;
  attemptId?: string;
  providerOccurredAt?: string;
  billingEntryId?: string;
  payload?: Record<string, unknown>;
};

export type RunCommand = {
  commandId: string;
  expectedRevision: number;
  type: string;
  payload: Record<string, unknown>;
  issuedAt: string;
};

export type RunCommandResult = {
  run: ProductionRun;
  events: RunEvent[];
};
