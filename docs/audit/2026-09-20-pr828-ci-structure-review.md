# PR #828：CI 执行边界结构复审

状态：结构审查，不能替代新提交的 Linux CI。范围为 `.github/workflows` 近七日五份根因合同及本轮 Unit 运行环境修复。

## 聚类不是五个相同错误

| 合同 | 缺失的不变量 | 现有负责边界 | 本次处置 |
| --- | --- | --- | --- |
| shipped-feedback-intake-config | 交付物真正携带运行配置 | write-intake-config / check-packaged-intake | 保留产物检查，不用开发机环境代替 |
| agent-storyboard-single-ledger | 落画布投影归属同一份真实方案 | 原 materializeShots / shot-table schema | 保留业务 owner；Golden 分别验证文稿保存及画布落地入口，不要求保存副作用创建节点 |
| e2e-job-fail-fast-serializes-findings | 所有独立步骤都参与结论 | chainSummary / workflow contract | 保留全量收集、统一失败汇总 |
| pr-body-gate-reads-a-stale-payload | 门岗读取当前被审对象 | prBody | 保留实时正文与取证失败拒绝 |
| browser-unit-ci-runtime | 实际执行 lane 提供所选测试依赖 | Quality Gate Unit job | 在 focused/full 分岔前安装锁定版本 Chromium，缓存使用平台 tmpdir |

共同结构风险是「配置声明和实际执行对象不一致」：工作流文件同时接入不同领域检查，不能仅凭 job 名称推断测试不需要浏览器，也不能用应用保存成功推断画布已经落地。修复落在各自现有 owner，未新增工作流编排器、产品执行路径或测试排除名单。

## 本次逐项核查

- `quality-gate.yml`：Unit 的安装顺序覆盖 focused/full；桌面 Feel 仍由原 desktop lane 执行，未为通过而迁走 browser integration 覆盖。
- `scripts/check-quality-gate-workflow.node-test.mjs`：原禁止 Unit 执行 Feel 的规则保留；新增浏览器安装必须先于两条 Unit 命令的断言，原配置红测已保存。
- 三份 Vite fixture 使用 `mkdtempSync(tmpdir())` 并清理；不依赖 `/private/tmp`、共享缓存或本机预装浏览器。
- workflow scope、失败汇总、费用授权及 artifact 发布条件不变；不提高重试、等待预算或任何基线。
- Golden 两入口沿用原 UI：文稿草稿保存后零节点，明确原动作才落地；画布 Agent 入口仍验证生产表。二者各自保留冷启动和字段、结果断言。

## 反方检查与证据边界

另一种方案是把浏览器测试统一迁至 desktop；本次不选，因为需要同步改变 focused/full 选择和覆盖归属，扩大本轮 CI 修复。现有 Unit 明确执行这些测试，补齐运行依赖是更小边界。未来若分 lane，必须证明完整测试清单守恒。

本机原失败切片重跑三文件 55 项通过，日志 `/private/tmp/nomi-pr828-unit-failures-isolated-v2.log`；这只能证明本机该切片，不能证明 Linux 安装或全量争用已修复。第一次全量测试曾与 build/design-lab 同时运行并超时，需安静环境全量复验；不能仅因定点绿就归咎资源争用。最终 Linux CI、全量测试和新构建身份仍须单独对账。
