# 对话式模型接入与认证闭环验收记录

> 状态：🚧 进行中（Task 9 本地自动化已收口；真实供应商、原生 ComfyUI、WorkBuddy 与发布升级门仍待外部环境）

日期：2026-08-29

范围：Nomi v0.22 之后桌面安装版的 J0–J5 验收与最终交付。

## 证据口径

本记录把 `implemented`、`verified`、`committed`、`pushed` 和 `live` 分开记录。保存凭据、模型发现、Catalog 写入或 mock 请求，都不能替代真实生产任务、受限媒体验真、journal/CAS 提交和 fresh-process 读回。

所有结果均为脱敏摘要。API key、CredentialRef、Authorization、签名 URL、绝对路径和供应商原始错误页不进入 manifest、日志或 MCP 结果。

## 本地自动化结果

| 项目 | 当前结果 | 证据 |
|---|---|---|
| 全量 gates | PASS | `pnpm run gates`：880 个 Vitest 文件、8440 个测试通过，1 skipped；agent-runtime 151 项；typecheck、Electron build 通过 |
| J0 安装版 MCP | PASS（本地安装包） | `tests/ux/packaged-mcp-smoke.e2e.mjs`：43 tools、25 resources；Codex/Claude/Cursor 签名身份；未签名 generic host 写入被拒 |
| J0 无仓库 harness | PASS（本地安装包） | `tests/ux/model-integration-no-repo.mjs`：isolated cwd；签名 Codex 可建 draft；unsigned generic 只能读、写入被拒；provider requests=0 |
| J4 停止/重启读回 | PASS（无花费重启 smoke） | `tests/ux/model-integration-packaged.e2e.mjs`：同 session/revision 读回、凭据仍 missing、零重复 create；升级后真实生产调用仍待外部门 |
| J3 故障矩阵 | PASS（本地自动化） | `pnpm run test:model-integration:fault-matrix`：8 个聚焦 suite，覆盖 ledger、bounded media、safeStorage、origin/redirect 与恢复 |
| J5 既有接入回归 | PASS（自动化） | `pnpm run test:journeys` J3/J5 为 2/2，加现有 provider/catalog suites |
| 模型设置页 UI 走查 | PASS（真实 Electron） | `node tests/ux/model-onboarding.walk.mjs`：默认分层、连接页、亮色、暗色 4 张截图；亮/暗主题实际生效且相邻截图均有可见变化 |

## 外部验收状态

### J1 HTTP 多模型

当前为 `unverified`。尚未提供可在 Nomi 安全 UI 输入的 BananaRouter 或 blind provider 测试账号，因此没有发现/选择/认证/花费数字，也没有伪造 live pass。拿到账号后必须按官方文档验证完整分页、多能力、多模型、partial 原因、真实 create/poll/materialize/decode、fresh-process 和重启后正式调用。

### J2 原生 ComfyUI

当前为 `unverified`。本地 mock 已覆盖 API/UI workflow 转换、显式多媒体槽、`frame_rate` 为 number 和安全失败；但没有可授权的原生 ComfyUI Server，因此不能声称 `/upload/image`、`/prompt`、`/history`、`/view` 的真实 J2 完成。平台专用 Cloud/Serverless API 也不能冒充原生协议。

### WorkBuddy

当前为 `unverified`。generic MCP harness 已验证 tools-only/签名边界；真实 WorkBuddy 宿主未提供，不能把 generic 结果升级为真宿主证据。

## 发布前剩余清单

- [ ] 用真实 provider 账号完成 J1，并登记发现总数、分页完整性、逐模型/逐 mode 结果、请求次数和实际花费。
- [ ] 用原生 ComfyUI 完成 UI workflow + API workflow，两个以上不同媒体槽，重启后再次从正式入口执行。
- [ ] 完成安装包 stop/restart/upgrade 真实生产调用和 fresh-process 零重复 create 证明。
- [ ] 运行 J3 完整发布级故障矩阵，并完成双语/明暗 handoff 页面截图走查（模型设置页亮/暗已通过，handoff 页面仍待走查）。
- [ ] 整理当前未提交修改，刷新远端基线，提交任务分支并更新 PR；不直接 push 默认分支。

## 运行命令

```bash
pnpm run build
node tests/ux/model-integration-no-repo.mjs --packaged /absolute/path/to/Nomi.app
node tests/ux/model-integration-packaged.e2e.mjs --packaged /absolute/path/to/Nomi.app
pnpm run test:journeys
pnpm run gates
```

脱敏模板与当前摘要见 [`evals/model-integration/manifest.template.json`](../../evals/model-integration/manifest.template.json) 和 [`evals/model-integration/local-automated-2026-08-29.json`](../../evals/model-integration/local-automated-2026-08-29.json)。
