# Electron `write EIO` stdio guard

日期：2026-08-10
状态：完成

## 根因

开发启动器退出或被强杀后，Electron 仍可能在一个事件循环 tick 内收到 renderer 的 `console-message`。主进程把该消息转发到继承的 `stderr`，底层流异步返回 `EIO`；没有 `error` listener 时，Node 将这个流错误升级为未捕获异常。父进程 watchdog 能最终回收孤儿，但挡不住这段竞态。

## 范围

- 新增主进程 stdout/stderr 的被动 `error` listener，阻止 `EIO`/`EPIPE` 等 sink 故障再次升级为崩溃。
- 在现有 `installMainProcessLifecycle()` 安装点最早接线，保持打包与开发实例行为一致。
- 用可注入 stream 的单测证明两个输出流都被保护，且不写回 console。

## 不动项

- 不替换现有业务日志，不改变崩溃落盘格式。
- 不吞掉真正的业务异常；只处理日志目标流本身的异步错误。
- 不扩大父进程 watchdog 的退出策略。

## 验收

1. 聚焦测试先红后绿：模拟 stdout/stderr 发出 `error` 不会抛出或再触发日志。
2. Electron 主进程类型检查通过。
3. 相关 crash/lifecycle 测试与完整 gates 按改动风险执行。

## 实际结果

- `pnpm exec vitest run electron/processStdio.test.ts electron/mainProcessLifecycle.test.ts electron/crashLog.test.ts electron/parentProcessWatchdog.test.ts`：9/9 通过。
- `pnpm run typecheck`：通过（renderer + Electron）。
- `pnpm run build`：通过。
- `pnpm run test`：468 个测试文件通过、1 个既有工作树测试失败（`src/ui/app-shell/windowChrome.test.ts` 仍期待已从 `TaskCenterPanel.tsx` 移除的 `currentWorkbenchFloatingTopOffset`；与本次 stdio 改动无关）。
