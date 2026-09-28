# Release-critical 旅程必须一轮收齐失败

> 📎 教训 · 首次记录 2026-09-24 · 状态：✅ 已固化
> **触发场景**：RC、发版前验收、或一条 Electron 旅程链里有多个相互独立的必测面。

**结论**：同一提交上的 release-critical 旅程必须串行执行但逐步 `continue-on-error`，最后由统一 summary 读取每一步的真实 outcome 并 fail-closed。第一条红不能吞掉后面的证据，也不能把全部旅程并行化到互相污染的同一台 Electron 测试环境。

**为什么会踩**：2026-09-23 的 RC `35884850083` 把 Clip、Production MCP、MCP suite、elicitation、canvas performance 写在一个 `run: |` 长链里。Clip 走查虽然已经打印了全部 false 指标，但它的退出码让 shell 立即停止，后四条根本没有运行；这一轮只得到一个失败面，却支付了一次完整 RC 的墙钟。根因是发布工作流把“收集结果”和“最终判定”绑在了每条命令的默认 `set -e` 上。

**怎么用**：

- RC workflow 中每个 release-critical 命令都必须有独立 `id`、`continue-on-error: true`，并保持串行，避免 Electron userData、端口和临时素材互相污染。
- 最后必须有 `if: always()` 的 summary 步骤；它只能读取 `steps.<id>.outcome`，未知状态一律判红，且 summary 本身不能 `continue-on-error`。
- summary 同步上传截图、日志和输出证据；修复时按同一轮收集到的全部红项批量定性，不逐个红灯推送一轮。
- 变更后按变更面复用同一提交上已有的绿证据：只重跑受影响旅程、相关门禁和 RC；合入后再用 exact merged SHA 录收据。

**出处**：RC run `35884850083`；修复提交 `4d89ec4ac423be81a5bc49404f959b9e3ef08ade`；固化于 `.github/workflows/desktop-rc.yml` 与 `scripts/check-desktop-rc-workflow.node-test.mjs`。
