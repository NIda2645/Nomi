# 生成画布性能基准与优化计划

日期：2026-08-09
状态：执行中
范围：Electron 真构建、生成画布、图片/视频节点、高频微操作

## 目标

把“画布卡不卡”变成一套可重复、可比较、可定位的证据，而不是一次性的体感结论。基准必须能回答三件事：

1. 在大量图片和视频节点下，打开、平移、缩放、选中、框选、拖节点、缩放节点、拖动中缩放分别花了多少时间。
2. 卡顿来自哪一层：脚本、React/DOM 更新、样式重算、布局、绘制、媒体解码/激活，还是内存压力。
3. 优化之后是否真的改善了用户最常做的动作，且没有把媒体正确性、节点身份和交互契约弄坏。

## 测试矩阵

夹具完全自带本地媒体，运行时写入临时 projects 目录，不依赖外网、用户私有项目或模型额度。每个规模独立启动 Electron，避免前一场景的缓存和 store 污染后一场景。

| 档位 | 图片节点 | 视频节点 | 总节点 | 边 | 时间轴 clip | 用途 |
|---|---:|---:|---:|---:|---:|---|
| empty | 0 | 0 | 0 | 0 | 0 | 空画布下限 |
| S | 24 | 24 | 48 | 96 | 12 | 小项目回归，确认优化不伤轻场景 |
| M | 48 | 48 | 96 | 192 | 24 | 当前 96 节点基线的可控版本 |
| L | 96 | 96 | 192 | 384 | 48 | 常规重项目，暴露节点订阅/边层问题 |
| XL | 160 | 160 | 320 | 640 | 80 | 压力边界；超时或渲染器崩溃要诚实记录 |

图片使用 960x540、1920x1080 两种本地 PNG；视频使用 2 秒、720p、24fps 的本地 MP4，多个节点可复用文件但每个 `<img>/<video>` 都独立计数。夹具记录精确媒体字节数、节点数、边数和 clip 数。

## 每个规模的操作协议

每个场景先等待画布稳定 1 秒，再执行 1 次环境预热、5 次独立进程采样；每个样本使用隔离的 user-data 和 projects 目录，避免 store 与媒体缓存串场。鼠标路径固定为相对 stage 的比例坐标，禁止依赖屏幕绝对像素。单个操作使用 60 次 pointer move，间隔 16ms，模拟一秒真实拖动。

| 场景 | 真实用户动作 | 关键判据 |
|---|---|---|
| cold-open | 打开项目并进入生成画布 | first canvas、首批可见媒体、全量媒体 settle 时间 |
| blank-pan | 空白左键拖，往返 2 秒 | 跟手帧率、最大帧间隔、长任务、布局/样式增量 |
| node-drag-image | 拖一张可见图片节点 60 步 | 拖动帧率、节点 DOM 身份、布局/脚本成本、浮层收起 |
| node-drag-video | 拖一个可见视频节点 60 步 | 同上，额外检查 video readyState 和解码没有扩散 |
| marquee-select | Shift+左键框选 20-50 个节点 | 选区完成延迟、选择期间长任务、边标签增量 |
| click-select | 连续点选/Shift 加选/空白取消 30 次 | 每次反馈延迟、Mutation、React commit 代理指标 |
| wheel-zoom | 光标锚点交替放大缩小 60 次 | 锚点漂移、帧率、样式/布局增量 |
| pan-zoom-mix | 按住左键平移中滚轮缩放再继续拖 | 不抖、锚点不漂、10px 增量位移误差 |
| resize | 拖图片和视频节点的右下角 60 步 | resize 帧率、布局/绘制成本、媒体不重复加载 |
| media-reveal | 缩放/平移让离屏节点逐批进入视口 | 激活队列峰值、实际 `<img>/<video>` 数、首帧/元数据延迟 |
| video-hover | 在 12 个视频节点上悬停 1 秒再移走 | 同时播放数量、video 事件、最大帧间隔、资源增长 |
| reload-heavy | 重载 L/XL 项目并重复 cold-open | 资源/DOM/heap 是否随重载泄漏 |

## 指标定义与预算

所有时间单位为 ms，帧率按采样窗口内 `requestAnimationFrame` 计数。每个场景同时采集 Chromium CDP `Performance.getMetrics`、`Memory.getDOMCounters`、页面 `PerformanceObserver(longtask)`、RAF gap、MutationObserver 和媒体 DOM 状态。

### 交互体验指标

- `fps_p50/p95`：按 1 秒窗口计算的每帧间隔反推；p95 用于抓住尾部抖动。
- `frame_gap_p95/max`：目标 p95 ≤ 33ms，max ≤ 100ms；超过 50ms 记为用户可感知卡顿。
- `long_task_count/total_ms/p95`：主线程任务 >50ms；目标每秒 0 个，压力档允许最多 1 个且 ≤80ms。
- `action_latency_p95`：pointerdown/click 到第一次 DOM/变换反馈；目标 ≤50ms。
- `anchor_error_px`：缩放前后光标下画布坐标漂移；目标 ≤1.5px。

### 渲染与结构指标

- `dom_nodes`、`.generation-canvas-v2-node`、`img`、`video`、`loaded_media`：确认虚拟化和媒体延迟策略是否生效。
- `layout_count`、`recalc_style_count`、`script_duration_ms`、`layout_duration_ms`、`paint_count`：来自 CDP，按场景前后差值记录。
- `mutation_count`：stage、edge SVG、标签层分别计数；空白点击且空选区必须为 0。
- `node_identity_preserved`：拖动/平移前后 DOM 引用保持，防止整层卸载重建。

### 资源与内存指标

- `js_heap_used_mb`、`dom_nodes`、`documents`、`js_event_listeners`：来自 CDP Memory/Performance。
- Electron `app.getAppMetrics()` 中 renderer/gpu 的 working set/private MB；macOS 不可用时记录 null，不用伪造。
- `resource_count/decoded_media_count` 和媒体 readyState；视频同时活跃数目标 ≤1，图片激活数目标 ≤4。
- `reload_heap_delta_mb`：连续重载三次后的 heap 增长；目标 <10MB，超过则进入泄漏调查。

### 通过线

基线不是单一平均数：以同一机器、同一构建、同一规模的 5 次采样中位数和 p95 为准。硬失败条件：页面错误、Electron renderer crash、操作超时、锚点漂移 >1.5px、节点 DOM 身份丢失、媒体激活上限失效。软预算按上面指标执行；XL 若超过 30 秒仍未稳定，记录为压力边界而非把超时吞掉。

## 结果格式

每次运行写入 `tests/ux/perf-results/canvas-<label>.json`，包含 git commit、平台、Electron/Chromium 版本、viewport、夹具摘要、每场景 5 次原始样本、`median`、`p95`、预算判断和错误。另写一份人读报告，禁止只提交截图或单个总分。

## 优化循环

1. 先跑 `baseline`，按 `p95 frame_gap`、`long_task_ms`、`layout/recalc`、renderer memory 排序热点。
2. 一轮只改一个根因层问题，保留操作协议不变；先补最小结构测试，再跑同一基准。
3. 只有当目标场景 p95 改善 ≥10% 且其他规模无回归，才保留优化；否则回退该实验。
4. 连续两轮只得到 <5% 的噪声级收益，且所有档位在预算内，视为当前实现的优化平台期，停止继续堆复杂度。
5. 最终运行一次真实 Electron 截图走查，确认“快”没有以空白节点、媒体不显示、拖拽错位或交互失效为代价。

## 2026-08-09 实测结果

正式五次采样见 `tests/ux/perf-results/canvas-baseline-hot.json` 和 `canvas-final-hot.json`，比较报告见 `compare-final.json`。比较器按绝对噪声下限过滤跨进程波动，并将 renderer working set 作为 advisory；最终为 12 项明确改善、0 项可比较回归、0 项硬失败。

| L 档热点 | baseline | final | 变化 |
|---|---:|---:|---:|
| 连续选择 FPS 中位数 | 60.2 | 73.2 | +21.6% |
| 连续选择 frame gap p95 | 82.8ms | 53.2ms | -35.7% |
| 连续选择最大 frame gap p95 | 432.6ms | 93.0ms | -78.5% |
| 连续选择 long task 总时长 p95 | 325ms | 60ms | -81.5% |
| 连续选择脚本时长中位数 | 466.2ms | 376.1ms | -19.3% |
| 视频节点拖拽 frame gap p95 | 43.6ms | 33.3ms | -23.6% |
| 媒体切入最大 frame gap p95 | 331.7ms | 56.3ms | -83.0% |

保留的实现优化是：未选中节点不再订阅全局多选布尔值；生成引用解析按不可变 nodes/edges 数组引用缓存节点、边和资产类型索引；节点关系查询缓存帧来源和镜头序号索引。XL 320 节点压力样本无 renderer crash 或硬失败，图片/视频激活峰值和同时播放视频数均守住上限。

剩余软预算缺口有两项：L 视频拖拽 33.3ms（预算 33ms，超 0.3ms）和 L 连续选择 53.2ms。又验证了“逐边 memo”和“延迟批量工具条”两种方案：前者 frame gap p95 仅改善 1.3%，后者把工作集中成额外 long task，均未达到保留线并已撤回。继续降低连续选择尾延迟需要改变边高亮/批量工具条的即时反馈语义或引入更重的渲染架构，当前证据不足以换取这类复杂度，因此在此停止实现层优化，并把连续选择保留为后续回归热点。

最终真实 Electron 手势走查通过 38 项断言；连续平移 60 帧期间 CDP `LayoutCount` 增量为 0。

## 不测内容

不调用任何真实生成 API，不把网络下载耗时混进画布交互；不以 headless 浏览器替代 Electron；不把单纯生产构建体积警告当作画布交互性能结论。
