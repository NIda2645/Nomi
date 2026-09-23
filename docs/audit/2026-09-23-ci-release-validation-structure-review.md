# CI 与发版验证结构评审（2026-09-23）

> 状态：📎 交接/日志
> 触发：`check:symptom-cluster` 在 2026-09-17 至 2026-09-23 发现 `.github/workflows` 与 `scripts` 多份根因合同。
> 范围：发布候选验证、浏览器运行时供给、门岗合同和生成式 CI 测试入口。

## 触发证据

近期修复同时落在 `.github/workflows` 的执行边界和 `scripts` 的门岗/合同入口：Unit 曾缺 Chromium，RC 又重复暴露同一类缺口；门岗脚本还承载合同、工作流引用、症状聚类和测试分档。重复出现说明 CI 的运行时供给和验证编排需要共享约束，不能让每个 workflow 自己猜哪些浏览器测试会被选中。

## 结构判断

### 1. 浏览器运行时由执行 lane 负责

`.github/workflows/quality-gate.yml` 已在 Unit 和 desktop-linux 的真实执行边界安装 `pnpm exec playwright install --with-deps chromium`。`desktop-rc.yml::validate` 现在复用同一命令，并且在 `pnpm run gates` 之前执行；浏览器测试保持真实运行，不通过跳过来掩盖环境缺口。

### 2. 发布合同只校验可观察的顺序

`scripts/release-contract.test.mjs` 只锁定 RC workflow 必须先安装 Chromium 再跑 gates，不复制 workflow 逻辑，也不创建第二个安装脚本。发布合同负责在提交和 CI 合同阶段拦住入口漂移，真实浏览器执行仍由 workflow 完成。

### 3. 测试入口与根因合同保持分层

`.github/workflows` 负责机器能力和 job 编排；`scripts` 负责合同、门岗和测试命令；`tests/ux` 与 `src/workbench` 负责产品行为。新增修复必须落在最早共享边界，并为同类入口增加一条能失败的回归测试。

## 复发防线

- RC、Unit、desktop-linux 三条 lane 都必须在浏览器测试前安装同一 pinned Chromium。
- 发布合同测试检查 RC 的安装顺序；`check:root-cause-contracts` 检查合同覆盖和门表。
- 真实 RC 仍必须完成完整 gates、Electron smoke、真实 journey、Mac 双架构、Windows 和发布关键旅程，不能用本地绿替代。

## 结论与后续

本次 RC 失败属于 CI 运行时供给未接到执行 owner，而不是产品功能失败。修复集中在 `.github/workflows/desktop-rc.yml` 与 `scripts/release-contract.test.mjs`，没有新增旁路 runner。后续若同一层再出现第三份合同，先更新这份结构评审并检查是否应把能力供给进一步集中到共享 workflow action。
