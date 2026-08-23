# Nomi SEO Observatory — 设计说明

## 目标

让 Nomi 的官网与 GitHub 入口能被正确理解、抓取和分享，并建立一个低风险的周期机制：定期测量公开页面与站点基础信号，保存趋势，生成可验证的优化假设，再由 Codex 以 PR 形式交付可逆改动。

## 真实摩擦与判断

- 用户点进社区入口会落到 GitHub 404：仓库没有启用 Discussions，官网和 README 却仍宣传 Discussions。这是信任与转化损失，不是文案偏好问题。
- 首页元数据已经较完整，quickstart 与 handbook 是公开入口，却没有同等的描述、社交卡片、规范链接和结构化页面身份，搜索引擎只能把它们当孤立 HTML。
- sitemap 的日期长期停留在旧日期，抓取系统无法判断页面是否真的更新。
- “自己优化”不能等于无人审查地改主分支。周期数据先写入报告；Codex 只自动产生低风险、可回滚的 PR，涉及事实、产品方向或大段内容时只产出建议。

## 方案

### 1. 单一元数据与页面图谱

营销内容继续以 `scripts/marketing/content.mjs` 为唯一文案源。首页、quickstart、handbook 统一输出：title、description、robots、canonical、Open Graph、Twitter card、`WebPage`/`SoftwareApplication` JSON-LD。结构化数据只描述页面上真实存在的产品与链接，不添加 FAQ 或虚假的评分。

GitHub Discussions 链接统一改为实际存在的 GitHub Issues 入口；Issues 不需要仓库设置就能在 PR 中验证。

### 2. 可重复的审计器

`scripts/seo/seo-audit.mjs` 使用 Node 内置 `fetch` 与小型 HTML/XML 提取器，不引入运行时依赖。它读取站点 manifest，检查每个公开页面的关键元数据、canonical/hreflang、JSON-LD、图片 alt、robots、sitemap 覆盖与 lastmod 新鲜度；可选读取 PageSpeed Insights API（仅当 workflow secret 存在）。输出带时间戳的 JSON 原始数据和人类可读 Markdown 报告，失败项带规则 ID、证据和修复建议。

### 3. 周期观测与优化闭环

`.github/workflows/seo-radar.yml` 每周运行一次，也支持手动触发。它不上传项目内容或提示词，只访问公开站点，生成新的 `docs/seo/data/*.json` 与 `docs/seo/reports/*.md` 并开一个 report-only PR，不直接推送 `main`。无 API key 时仍运行技术审计，PageSpeed 状态明确标为 `not_configured`。

当前 Codex 线程配置一个每周 heartbeat：阅读最近报告与历史趋势，查阅官方搜索/结构化数据文档，提出 1–3 个带证据的假设；只对确定性低风险修复开 PR，内容策略和外部仓库设置只写建议。所有 PR 继续经过现有 gates、测试和体验走查。

## 不做

- 不加入 `llms.txt`、关键词堆砌、虚假 FAQ/评分或隐藏文本。
- 不把用户项目、素材、提示词、密钥上传到第三方服务。
- 不在本次 PR 中直接修改 GitHub 仓库设置（如启用 Discussions、Topics）；代码内只修复可验证的死链，仓库设置作为报告中的外部建议。
- 不把搜索排名承诺为确定结果；报告只记录可观测信号与下一步假设。

## 验收

1. `pnpm build:site` 与 `pnpm build:handbook` 生成物可重复，所有公开页面元数据检查通过。
2. `pnpm test:seo` 对正常页面、缺失 canonical、过期 sitemap、死链替换等场景有红绿测试。
3. `pnpm seo:audit -- --base-url https://nomiaqm.com --out-dir /tmp/nomi-seo-report` 能产出 JSON/Markdown；网络失败时退出非零并保留证据。
4. workflow 文件可被 GitHub Actions 解析，周期运行只提交报告变更。
5. 现有站点静态、类型、lint、构建门禁保持通过；README/官网不再链接 `/discussions`。
