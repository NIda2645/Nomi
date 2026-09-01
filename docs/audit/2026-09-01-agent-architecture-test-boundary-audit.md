# Agent 架构与测试边界审计（2026-09-01）

> 状态：提交前审计记录。本文只记录当前代码可证明的边界与测试方案约束，不把计划中的 Host 当成已经存在的生产模块。

## 结论

测试系统应围绕现有生产接缝建立，而不是先假设一个新的 `ProjectAgentHost` 再为它造一套平行运行时。当前可证明的控制面由 Pi runtime、Context service、ProductionRun、能力桥和 Skill store 组成；M1 的 harness 只能作为测试替身，通过公开入口注入，不得复制生产业务语义。

这条结论是本轮 M0 之后的架构审查修正：早期 owner map 把未来目标结构误写成了当前现状，且容易让测试目录演变成第二个 runner。现已在 `tests/agent-system/schema.mts` 中明确区分 `current / production-seam` 与 `planned / test-double`。

## 当前生产接缝（证据）

| 责任 | 当前 owner | 允许的测试接入方式 |
|---|---|---|
| Pi 会话与模型循环 | `electron/harness/runtime/pi/session.mts`、`run.mts` | 使用 `createControlledSession` / `runAgentTurn` 的公开入口注入 scripted model 或受控 provider |
| 上下文生命周期、取消与 snapshot | `electron/harness/context/contextService.ts` | 测输入/输出与生命周期，不在测试目录复制 context 拼接规则 |
| ProductionRun 控制面、恢复、策略 | `electron/productionRun/productionRunRuntime.ts`、`productionRunService.ts` | 使用现有 service / execution contract；fake provider 只记录 effect，不重写结算逻辑 |
| MCP / 能力目录 | `electron/capabilityCore/mcpProtocol.ts`、`mcpCapabilityProjection.ts` | 通过已有 catalog/projection seam 测工具表面与调用边界 |
| Renderer 请求/审批回路 | `electron/capabilityCore/rendererBridge.ts` | 使用现有 request/reply 关联与来源校验，测试超时、来源和拒绝 |
| Skill 发现与 manifest | `electron/skills/skillStore.ts`、`skillManifestSchema.ts` | 通过 `readSkillRecords` / `findSkillRecord` 或等价稳定入口注入受控 registry |

## 测试替身与生产代码的依赖方向

```text
tests/agent-system/contracts
        ↓
tests/agent-system/harness doubles
        ↓（只注入，不复制）
现有 production seams
        ↓
现有 scripts/test-system.mjs + tests/system/profiles.mjs
```

唯一 runner 仍是现有 `scripts/test-system.mjs`。`evals/` 只负责录制、脱敏、回放和评分，不新增第二套编排语义。测试替身的职责限定为输入控制、故障注入、effect/账单计数和事件证据；权限、审批、持久化和结算语义必须由生产边界决定。

## 本轮架构审查发现与处置

| 等级 | 发现 | 处置 |
|---|---|---|
| Critical | M0 owner map 只写了概念性的未来 Host，遗漏 `productionRunRuntime`、`contextService`、`rendererBridge`、`skillStore` 等真实接缝 | 已在 M0 修正并增加 current/planned 结构化断言 |
| Important | 测试目录可能形成第二个 runner / control plane | 计划锁定复用 `scripts/test-system.mjs` 与现有 profile；M1 不新增 runner |
| Important | 生产接缝与测试替身没有隔离，容易测试“自己写的逻辑” | schema 与目录约束分开列出 production seam/test double；M1 只放 harness doubles |
| Minor | 计划中的 profile 需要增量接到现有 stage，而不是新造命令树 | M4/CI 阶段再修改现有 profiles，先实现非空 stage 与 artifact contract |

## 提交前必须证明的事项

1. M1–M4 的每个测试都能指出对应生产接缝和证据路径。
2. 不存在绕过 ProductionRun、ExecutionContract、renderer 来源校验或 Skill/MCP owner 的平行实现。
3. `agent-contracts` 等 profile 复用现有 runner；没有空壳 package script。
4. fake provider 全程零真实额度；真实 provider 只在 M5、前置层全绿且另有 allowlist、预算和 run id 时运行。
5. 任何架构结论都区分“当前代码证据”和“下一阶段目标”，避免把计划当现状。

## 外部审查输入

外部审查 Agent 应同时阅读：

- 本文与 `docs/handoff/2026-09-01-agent-architecture-review-handoff.md`；
- `docs/research/2026-09-01-agent-architecture-root-cause-synthesis.md`；
- `docs/research/2026-09-01-agent-architecture-solution-and-execution-plan.md`；
- `docs/research/2026-09-01-agent-evaluation-and-test-research.md`；
- `docs/superpowers/plans/2026-09-01-agent-architecture-test-system.md`；
- `docs/ARCHITECTURE-NOW.md` 与本 PR 中的测试文件。

审查结果必须按 Critical / Important / Minor 分级，给出 `file:line` 证据，并明确哪些是测试基础设施问题、哪些是生产架构问题、哪些尚未有足够证据。该审查完成前不进入生产 Agent 改造。
