# issue #62 三问题分诊与修复计划（2026-08-11）

来源：[#62 "Does not work"](https://github.com/aqm857886159/Nomi/issues/62)（romanr）。一条 issue 里三个独立问题，逐条已在代码中坐实。

## A · 用户无法提交 bug（仓库配置）

**现状**：`.github/ISSUE_TEMPLATE/config.yml` 设 `blank_issues_enabled: false`，模板目录只有 `business_inquiry.yml`。
**后果**：报 bug 的唯一入口是商务合作表单 → 真实故障被挡在门外，看到的 issue 数是被过滤过的；#62 第一段的「issue 区成了营销工具」指控在配置层面成立。
**动作**（用户 2026-08-11 拍板）：新增 `bug_report.yml` + `feature_request.yml`，保留 `business_inquiry.yml` 不动。字段中英双语、只留必要项（D1：不让用户多填多读）。

## B · 关窗后 app 再也打不开（根因，最致命）

**根因**：`electron/productionRun/productionRunDesktopLifecycle.ts` 的 `second-instance` 只 `focus()` **已存在**的窗口，零窗口时静默空转；而新进程因拿不到单实例锁已 `app.quit()`。净效果 = 双击图标毫无反应，只能杀进程。

进入「进程活着但零窗口」的两条路：
1. macOS 设计如此 —— `window-all-closed` 在 darwin 不退出（`activate` 只覆盖 Dock 点击）。
2. 全平台 —— `recreateMainWindowFromSender` 先销毁旧窗，`window-all-closed` 因 `isRecreatingMainWindow` 被跳过；随后 `createWindow()` 若抛错，catch 只打日志 → 永久停在零窗口。

**修法（P2 修根因）**：main.ts 收口出唯一入口 `ensureMainWindow()`（零窗口才建、并发去重），`activate` / `second-instance` / 窗口重建失败三处全走它 —— 让「零窗口」在任何路径下都自愈，而不是逐个补症状。
**结构保证**：新增 `productionRunDesktopLifecycle.test.ts`，钉死「零窗口时 second-instance 必须建窗」这条不变量。

## C · 加了 provider 仍报「未配置」（慢性问题，需复现）

**慢性度**：#4 / #8 / #9 / #19 / #23 / #42 / #62 —— 同一主诉出现 7 次，是 issue 区最集中的单一问题。
**已确认的结构错位**：设置页徽标只看**供应商级**条件（`settingsAutomationView.ts:44`，`enabled && hasApiKey` 即判 connected），运行时要的是**模型级**条件（`executableModel.ts` + `types.ts` 的 `selectExecutableModel`：vendor.enabled ∧ model.enabled ∧ kind 匹配）。两者可同时成立 → 「设置里绿的」与「生成说未配置」并存，用户看不出自己缺什么。
**尚未定论**：手动接入路径要求至少一个 modelId（`onboardingSaveGate.ts`），故不太可能是「零模型」；更可能卡在 kind / modelKey 绑定。**本轮先复现再修，不带假设改代码。**

## 不动项

- `business_inquiry.yml` 与 config.yml 的 contact_links 保持原样。
- 单实例锁本身的语义不改（能力核前提）。
- C 在复现结论出来前不改任何 catalog 代码。

## 回滚

A/B 均为独立小改动，按文件 `git revert` 即可；B 的行为变化只在「零窗口」这一原本已死的路径上生效，不触及正常开关窗。

## 验收门

- `pnpm run gates` 全过（filesize → tokens → lint → typecheck → test → build）。
- B：新增单测覆盖「零窗口 → 建窗」「有窗口 → 恢复并聚焦」两分支。
- A：模板 YAML 能被 GitHub 解析（字段名合法、required 标注正确）。
