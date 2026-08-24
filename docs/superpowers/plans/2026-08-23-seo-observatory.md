# SEO Observatory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 Nomi 官网与 GitHub 的可抓取性/分享元数据问题，并交付一个每周保存 SEO 观测数据、产出优化假设的 PR-safe 机制。

**Architecture:** 继续以 `scripts/marketing/content.mjs` 为营销事实源；将 homepage、quickstart、handbook 的 head 统一到可测试的 metadata/schema contract。新增无依赖的公开站点审计器与 GitHub Actions 周期任务，报告只写入 `docs/seo`，Codex heartbeat 再把低风险确定性改动提成 PR。

**Tech Stack:** Node.js ESM、内置 `fetch`/`node:test`、GitHub Actions、现有营销静态生成脚本。

---

### Task 1: 固化 SEO contract 与死链测试

**Files:**
- Create: `tests/seo/seo-contract.node.mjs`
- Modify: `scripts/marketing/content.mjs`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `.github/ISSUE_TEMPLATE/config.yml`
- Modify: `tests/ux/marketing-home.static.mjs`

- [x] **Step 1: Write the failing tests**

  Assert generated/runtime content uses `/issues`, every public HTML fixture has description/canonical/OG/Twitter/JSON-LD, and sitemap contains the four canonical URLs without `/discussions`.

- [x] **Step 2: Run the focused tests and verify red**

  Run `node --test tests/seo/seo-contract.node.mjs`; expect failures for the existing Discussions URL and handbook metadata.

- [x] **Step 3: Implement the smallest contract fix**

  Change `shared.discussionUrl` to the real Issues URL and update Chinese/English labels and README/config links. Extend metadata rendering for missing page contracts in Tasks 2–3.

- [x] **Step 4: Run the focused tests again**

  Run `node --test tests/seo/seo-contract.node.mjs`; the dead-link assertions should pass while page metadata assertions remain explicit for the next tasks.

### Task 2: Unify metadata for all public pages

**Files:**
- Modify: `scripts/marketing/metadata.mjs`
- Modify: `scripts/marketing/template.mjs`
- Modify: `scripts/build-handbook-html.mjs`
- Modify: `marketing/quickstart.html`
- Modify: `marketing/index.html`
- Modify: `marketing/en/index.html`
- Modify: `marketing/handbook.html`
- Test: `tests/seo/seo-contract.node.mjs`

- [x] **Step 1: Add failing page-contract assertions**

  Test for `og:image:alt`, Twitter card fields, canonical URL, locale links where applicable, and a JSON-LD graph containing a `WebPage` plus the existing `SoftwareApplication` identity.

- [x] **Step 2: Run the contract test and capture red output**

  Run `node --test tests/seo/seo-contract.node.mjs`; quickstart/handbook should fail before implementation.

- [x] **Step 3: Implement shared page metadata**

  Add a small `buildPageMetadata` helper and render it in the two static pages. Import shared site constants and package version in the handbook builder so generated output cannot drift. Keep JSON-LD factual and escape `<` before embedding.

- [x] **Step 4: Regenerate and test outputs**

  Run `pnpm build:site`, `pnpm build:handbook`, `pnpm run check:handbook`, then `node --test tests/seo/seo-contract.node.mjs` and `pnpm run check:site`.

### Task 3: Make sitemap/robots a generated, checked surface

**Files:**
- Create: `scripts/marketing/site-manifest.mjs`
- Create: `scripts/build-marketing-sitemap.mjs`
- Modify: `marketing/sitemap.xml`
- Modify: `marketing/robots.txt`
- Modify: `package.json`
- Create: `tests/seo/sitemap.node.mjs`

- [x] **Step 1: Write failing sitemap generator tests**

  Given the manifest, assert the four canonical URLs, XML escaping, and deterministic `lastmod` values from the checked-in `updatedAt` fields.

- [x] **Step 2: Run `node --test tests/seo/sitemap.node.mjs` and verify red**

- [x] **Step 3: Implement manifest and generator**

  Keep page URLs and update dates in one ESM manifest; generator writes atomically and supports `--check`.

- [x] **Step 4: Add scripts and regenerate**

  Add `build:sitemap` and `check:sitemap`; run `pnpm build:sitemap` and the focused tests.

### Task 4: Build the SEO audit/report engine

**Files:**
- Create: `scripts/seo/seo-audit.mjs`
- Create: `scripts/seo/seo-audit.node.mjs`
- Create: `docs/seo/README.md`
- Create: `docs/seo/config.json`
- Modify: `package.json`

- [x] **Step 1: Write pure parser/audit tests first**

  Cover a passing HTML fixture, missing description/canonical, broken hreflang, stale sitemap lastmod, and PageSpeed not configured. Tests must use injected fetch responses, not the live internet.

- [x] **Step 2: Run `node --test scripts/seo/seo-audit.node.mjs` and verify red**

- [x] **Step 3: Implement audit functions and CLI**

  Export `auditHtml`, `auditSitemap`, and `runAudit`; use timeout-bounded fetch, rule IDs (`META-*`, `SCHEMA-*`, `SITEMAP-*`, `PERF-*`), severity, evidence, and recommendation. CLI args: `--base-url`, `--out-dir`, `--now`; optional `PAGESPEED_API_KEY` adds mobile/desktop scores.

- [x] **Step 4: Run unit tests and an offline smoke audit**

  Run `node --test scripts/seo/seo-audit.node.mjs`; run the CLI against local generated fixtures and verify one `.json` plus one `.md` report.

### Task 5: Schedule measurement without unsafe autonomous merges

**Files:**
- Create: `.github/workflows/seo-radar.yml`
- Create: `docs/seo/data/.gitkeep`
- Create: `docs/seo/reports/.gitkeep`
- Create: `tests/seo/workflow-contract.node.mjs`

- [x] **Step 1: Write workflow contract tests**

  Assert weekly cron, manual dispatch, least-privilege contents permission, audit command, and report-only commit paths.

- [x] **Step 2: Run the workflow contract test and verify red**

- [x] **Step 3: Implement the workflow**

  Checkout the repository, install pnpm dependencies, run `pnpm seo:audit -- --base-url https://nomiaqm.com --out-dir docs/seo/data`, render Markdown into `docs/seo/reports`, and open a report-only PR containing only those paths. The workflow must continue without PageSpeed secrets and must not push directly to `main`.

- [x] **Step 4: Add documentation for the heartbeat loop**

  Document the weekly Codex prompt: read latest report/history, compare official guidance, propose 1–3 falsifiable hypotheses, and open a branch/PR only for low-risk deterministic fixes; no direct main merge and no user data upload.

### Task 6: Verify, review, commit, and open PR

**Files:** all scoped files above.

- [x] **Step 1: Regenerate all tracked outputs**

  Run `pnpm build:site`, `pnpm build:handbook`, and `pnpm build:sitemap`.

- [x] **Step 2: Run focused and project gates**

  Run `pnpm test:seo`, `pnpm test:site`, `pnpm run check:site`, `pnpm run lint:ci`, `pnpm run typecheck`, `pnpm run test`, and `pnpm run build`. If a full `pnpm gates` is practical, run it too; do not claim completion without fresh output.

- [x] **Step 3: Request code review**

  Dispatch a reviewer against the branch diff, resolve all P0–P2 findings, and rerun affected tests.

- [x] **Step 4: Commit and push the task branch**

  Commit only scoped changes as `feat(seo): add metadata contract and observatory`, push `codex/seo-observatory` to origin, and do not push or merge `main`.

- [x] **Step 5: Open the PR and configure the recurring heartbeat**

  Create a PR targeting `main` with the audit evidence and verification commands. Configure a weekly Codex heartbeat attached to this task to read `docs/seo/data` and `docs/seo/reports` and follow the documented PR-safe optimization policy.
