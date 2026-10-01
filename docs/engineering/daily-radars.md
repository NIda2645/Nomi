# 每日雷达与三日竞品雷达（L2）

> 从 CLAUDE.md 搬来。**现在由 SessionStart hook（`scripts/claude-hooks/daily-radar.sh`）直接跑脚本并把结果注入会话**，不再靠 agent 自觉在第一条消息里去跑；失败时 hook 会明说「今天没查成」。本文是细则与分诊规矩。

**③ 用户反馈雷达**：（SessionStart hook 已跑） `pnpm run intake:radar`（从 Cloudflare 增量拉用户反馈 / 匿名用量事件 / Agent 轨迹，算成功率、错误码排行、和上一窗口比的突增）。确定性脚本，不烧额度；有新反馈或有突增时才起 `nomi-intake-radar` 技能做分诊（归真 bug / 配置问题 / 体验问题 / 数据上报问题，挂私有待办）。脚本报错 = 明说「今天没查成」，**不许**说成「没有新反馈」。原始数据与报告只落仓库外缓存目录（`%LOCALAPPDATA%\nomi-intake\`，可用 `NOMI_INTAKE_CACHE` 改），不进仓库、不进提交。

**② 供应商模型雷达**：同一时机跑 `pnpm run radar:models`（apimart / kie 有没有上新生图/生视频/音频模型）。确定性脚本，不烧额度；`新增 > 0` 时才起 `nomi-model-radar` 技能做分诊。脚本报错 = 明说「今天没查成」，**不许**说成「没有新模型」。用户点头要接某个 → **先出接入方案**（契约摘要+档案设计+分档理由），点头后才写码。快照要等用户看过再 `-- --update-baseline`。

**① 论文雷达**：hook 比对 `currentDate` 与 `docs/research/` 里最新 `<date>-radar.md` 的日期——今天还没有 → 静默跑 `nomi-research-radar` 技能（额度默认授权），出 `docs/research/<今天>-radar.md`，回答时带出当天最该动的 1-2 件事；今天已有 → 跳过。筛选维度见技能内部（最新·火不火·有没有用·成熟度），低于 bar 的筛掉。

## 三日竞品学习雷达

**核心对标 LibTV / TapNow，扩展对标 Higgsfield / MiniMax Design / RunningHub。** 产品、设计、引导、功能交互、Agent、生态、社区与自媒体营销统一走 [`nomi-competitive-radar`](agent-skills/nomi-competitive-radar/SKILL.md)，入口与资料在 [`docs/research/competitive/`](docs/research/competitive/README.md)。每个 Nomi session 首轮检查到期/未完成周期；每 3 天扫描全部对象并轮换深挖，和本机定时器共用规程中的去重/锁/检查点。用户明确只建流程时不展开调研。实际交互要鼠标操作与录屏回看，自媒体用 TikHub + 原站观看；失败不能记“无更新”，研究建议不能自动变成开发或发布授权。
