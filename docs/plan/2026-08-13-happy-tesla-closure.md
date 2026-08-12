# happy-tesla 分支收口计划

## 背景

`claude/happy-tesla-f1a851` 已经把自定义调用的失败自救、供应商级自由配置、文本脚本与
`saveFile` 运行时能力分别接上，但“试跑”仍只认资产结果，导致文本脚本成功后显示为 0 个产物，
而依赖 `saveFile` 的脚本在试跑阶段无法验证。

## 范围

- 让自定义调用试跑 IPC 返回并展示 `{ text }` 文本结果。
- 让试跑的 `saveFile` 提供临时可预览的 data URL（真实任务仍落项目资产；大二进制不在 UI 中拼超大 data URL）。
- 补回归测试，锁住文本与 saveFile 的两条结果契约。
- 运行统一 Electron 走查、完整门禁，并核对现有失败自救/配置持久化走查。

## 不动项

- 不改变真实任务的 `writeAsset` 落盘、缓存、付费闸、资产本地化和溯源链。
- 不把文本结果塞进 `assets`，不让裸字符串从资产形状变成文本形状。
- 不扩展自定义调用的远程脚本执行权限；继续沿用现有 `new Function` 本地信任边界。

## 验收

1. `custom-call:test-run` 对文本脚本返回 `text`，编辑器成功态展示文本而不是“0 个产物”。
2. 试跑脚本可调用 `saveFile`，小二进制返回可预览 URL；真实任务仍返回 `nomi-local://` 项目资产 URL。
3. 相关单测、`pnpm run gates`、`custom-call-config.walk.mjs`、`adapter-failed-unlock.walk.mjs` 通过。

## 回滚

回滚本计划新增的 IPC/UI/test 改动即可；不回滚已有的自定义调用派发或验证分级实现。
