# 等待格子一致性：逐改审计（2026-09-20）

基线 `96d368c26c2e5c1f0534861be9b9100630275097`。当前为实现与本地验证记录；PR/merge身份及最终CI以交付收据为准，不把本报告当成已合入证明。

## 为什么蓝条仍在

9月9日 `2026-09-09-process-feedback-imgfx.md` 明确留下静态淡带；9月14日改为柔和扫光，并未删除非admitted分支。当前硬限制让第5个节点、低缩放、离屏、reduced/noGPU进入该分支。本轮此前的图片比例/镜头编号提交没有重新引入此条。

用户本轮明确选择：可见卡片优先全播放格子动画，先测性能再定限制。测量支持去掉固定四实例上限，保留真正的可见性/缩放/能力/无障碍准入。

## 生产逐改

| 文件 | 旧行为 | 修改及必要性 | 正确性证据 / 限制 |
|---|---|---|---|
| `src/workbench/generationCanvas/nodes/GenerationWaitingSurface.tsx` | 四实例owner集合/订阅，其余是中间横带；初次挂载先经过一次静态带 | 删除owner集合和配额，以现有准入条件直接挂img-fx；无浏览器不挂shader；不准入时用静态token格子，音频仅原灰柱 | 八节点旧4新8先红后绿；8/16/32性能与卸载；预览/最终图、底部真实percent、1100ms deadline代码保留；未新增动画引擎 |
| `src/workbench/generationCanvas/nodes/generationWaitingSurface.css` | 蓝带及1.9s无限扫光，显式reduced或无GPU时仍可能动画 | 整文件及import删除；旧路径不存在 | 静态格子正向存在+无animation+旧band负向；非仅检测“空白” |
| `src/workbench/generationCanvas/nodes/processMotionCapability.ts` | 临时WebGL能力探测未明确释放 | finally只释放探测自己创建的context，不动img-fx renderer；释放扩展失败不篡改能力判定 | 成功/失败释放、序列化、真实Chromium探测；扩展不支持时由浏览器回收 |
| `src/workbench/generationCanvas/nodes/useReducedProcessMotion.ts` | 每consumer初始化+effect再次探测 | WeakMap按Document复用renderer信息；系统偏好仍实时读取/订阅 | 八consumer StrictMode旧32探测/0释放，新1/1；动态偏好/重挂载/cleanup；同Document GPU切换需重载重探测 |
| `src/devlab/designLab/processFeedback/states/01-process-feedback.tsx` | 实验室名称仍说“扫光带” | 名称与静态格子一致 | 27项该屏视觉检查通过，未更新基线 |

## 测试与诊断逐改

| 文件 | 为什么改 / 保留了什么 |
|---|---|
| `src/workbench/observability/generationFeedback.test.ts` | 新增reduced/低zoom/离屏/导入静态格子及音频无蓝带断言；没有伪造图或百分比；旧代码确实失败 |
| `src/workbench/generationCanvas/nodes/useReducedProcessMotion.test.ts` | 探测释放、序列化、多消费者复用、null缓存与新Document边界；保留全部renderer分类测试；浏览器执行移到既有e2e脚本，不给unit任务增加Chromium安装要求 |
| `tests/ux/canvas-perf/waitingFxScenario.mjs` | 期望从固定4改成真实可见数量；8/16/32可选固定负载；采样从180rAF改30秒；保持实际视口、zoom>=.4、销毁断言，性能预算原样；夹具赋独立镜号避免绕store直接克隆制造重复镜号 |
| `tests/ux/canvas-perf/failureDiagnostics.mjs` | static shell诊断跟随新格子锚点，保留按节点排查能力 |
| `tests/ux/canvas-perf/failureDiagnostics.test.mjs` | 诊断样例随锚点改名，错误保留断言不弱化 |
| `tests/ux/canvas-real-suite.test.mjs` | 同上，只更新错误文本中的锚点 |
| `tests/ux/import-reveal.walk.mjs` | 原“无GPU有渐变带”改“有静态格子且零动画”；所有路径无蓝带；保留真实字节比例与落盘检查 |
| `tests/ux/process-feedback-electron.e2e.mjs` | reduced断言迁到静态格子，其余任务/时间轴链路保持 |
| `tests/ux/process-feedback-imgfx.e2e.mjs` | reduced/zoom检测新锚点；新增无动画/旧band不存在、CSS交集两层遮罩；真实StrictMode probe在浏览器场景执行 |
| `tests/ux/process-feedback-imgfx-real.e2e.mjs` | 扩展已有真实队列/真实图片loopback任务：鼠标平移仍有动画、系统动态切换、设置面板切en、截图；继续验证真图揭示与完成清理 |
| `tests/ux/process-feedback.e2e.mjs` | 音频只查自身灰柱，不再要求一条已删除的蓝带；图像/视频reduced看格子 |

两份 `docs/fixes/2026-09-20-{waiting-grid-consistency,process-motion-probe}.root-cause.json` 保存门表、共享不变量、回归与风险；对应plan记录先查上游/旧方案、实施范围、回滚。证据目录均为本轮结果，不更新旧历史审计。

## 测量与体验核验

原始数据、红测日志和实际截图：[证据目录](2026-09-20-waiting-grid-evidence/)。

| 实际Electron可见节点 | 动画数 / 静态数 | 采样 | UI FPS | 帧间隔P95 | 长任务 |
|---|---|---|---|---|---|
| 8 | 8 / 0 | 30.263s | 120 | 9.3ms | 0 |
| 16 | 16 / 0 | 30.275s | 120 | 9.2ms | 0 |
| 32 | 32 / 0 | 30.265s | 119.9 | 10.1ms | 0 |

这是M5、macOS arm64、Metal的UI采样；shader本身约10fps。每档一个样本，独立库4/8/16各30秒也无长任务；不声称无限节点/全部GPU/长期能耗已经证明。视口和40%缩放仍限制实际重绘负载。

真实Electron任务：真实点击新建节点/输入提示词/生成确认，loopback供应商负责可控时序，预览和最终落盘走生产代码；中文/英文截图已人工查看。鼠标平移40px断言、动态减弱切换、预览真图、最终图揭示均通过；等待遮罩1124.5ms移除，小于1200ms期限。无付费请求。

独立代码复核未发现阻断。CTO：共享边界删旧不增引擎；设计：复用原动画与token格子；PM：没有伪造进度；前端：生命周期/可见性保护保留；后端：协议/持久化无改动；用户：多卡等待一致且可平移，结果完成无遮挡。完整门禁/Ponytail/PR状态将在交付时报告。


## CI发现：磁吸把手验收的旧尺寸假设

PR Linux画布验收和本机Electron均复现：旧测试期望168，实际163。夹具图片及meta均为16:9；旧测试写入240×180名义尺寸，但已合入的图片比例逻辑正确导出240×135。CSS与目标热区的既有契约均是`min(168,卡高+28)`，故163正确。属于可复发的测试契约遗漏，不是生产布局缺陷；本次只改验收，不新建生产修复合同。

`canvas-magnetic-handle.walk.mjs`现在独立断言实际短卡135与高卡180，再验收左右把手163与168两个分支；保留宽112、指针跟随、吸附连线和近距连线可点击的全部断言。第一张与目标间距不变，第二张使用320宽的实际16:9比例覆盖上限。没有放宽精度、重试或改生产尺寸。机械门表扫描了夹具三个调用入口；另核对图片比例走查、性能夹具和CSS/目标热区/视觉契约的同类规则，固定168的错误预期仅此处。保留现役React Flow，无第三方行为变更。

红证据`magnetic-before.json`，绿证据`magnetic-after.json`（4/4真实Electron任务通过）；旧历史截图未覆盖。独立复核确认163是产品合同要求。


## CI发现：Agent仅改已有镜头仍自动缩放

旧`multiShotCanvasLanding.ts`每次materializeShots都请求fit；提示词重绑定、同版本重放、结果回填也触发360ms延迟导航。节点提示词已正确落盘，但80%完整分镜表被缩到约59%（compact），用户阅读位置丢失。原金路径有时在延迟fit前读取而误绿，Linux本轮实际捕捉到画面列消失。

共享落地函数现只在新增节点、分组或表时请求既有fit，复用现役信号；不改变镜号、绑定、选择、结果写入、撤销或持久化。六个新增单测覆盖rebind/replay/result不导航，以及初次落点、补组、扩展为多镜仍导航。生产diff只收紧原fit调用条件；各调用入口审计、v3门表和不变量在`2026-09-20-materialization-viewport.root-cause.json`。

`golden-path.e2e.mjs`复用现有视口稳定等待，记录改前transform，改后仍要求同一transform与full密度，再执行原提示词断言，不重新缩放掩盖问题。旧dist确定性红：matrix缩放0.8变0.589109；新构建完整七阶段任务通过（包括只改第二镜、生成落盘、冷重启），5次文本和1次图像均由loopback响应，付费0。红绿报告为`golden-viewport-before.json`/`golden-viewport-after.json`，真实截图`golden-viewport-preserved.png`已人工查看。远端Linux再次验收待交付检查，不能由本机通过代替。
