# 本地视频预览恢复计划（2026-08-24）

## 用户摩擦

供应商已经完成生成、文件也已经落到项目资产目录，但用户重开项目后仍看到“加载超时/无法播放”。这会让用户误以为需要重新生成，带来重复扣费风险。

## 根因假设

`nomi-local` 协议把 Node `fs.ReadStream` 直接作为 Electron `protocol.handle` 的 `Response` body。单元测试能读到字节，但真实 Chromium 媒体请求可能没有收到可消费的 Web stream，导致视频元素一直等不到首帧，8 秒媒体槽 watchdog 误报超时。

## 范围

- 把本地协议的文件流显式转换为 Web `ReadableStream`，覆盖完整响应和 Range 响应。
- 媒体槽 watchdog 超时只释放并发槽，不清掉仍在加载的 `src`；视频节点挂载时显式调用 `load()`。
- 补真实协议响应的 body 可消费测试，保留状态码、Content-Range、Content-Length、CORS 头。
- 用已经落地的 6 秒/低清 MP4 在隔离 Electron 实例中重开项目验证，不再次调用供应商。

## 不动

- 不修改供应商 adapter、任务重试、扣费或生成确认流程。
- 不把“媒体加载重试”变成“重新提交生成任务”。

## 验收

1. 协议单测完整/Range 都能消费到真实文件字节。
2. typecheck、协议 focused tests、diff-check 通过。
3. 隔离 GUI 重开同一项目后，短视频节点显示可播放控件，不出现加载超时；供应商事件仍只有一次。

## 完成记录（2026-08-24）

- `nomi-local` 完整/Range 响应统一使用 Web `ReadableStream`。
- 媒体槽超时不再清掉仍在加载的 `src`；视频节点挂载显式调用 `load()`；StrictMode 的合成 effect cleanup 不再清空仍连接在 DOM 上的视频源。
- 隔离 GUI 重开同一 APIMart 项目后，节点显示 6 秒视频播放控件并实际播放；供应商 task 记录仍为单次，未触发第二次提交。
- focused protocol/media tests 19/19、typecheck、eslint、diff-check 通过。
