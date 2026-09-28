# GPU probe 生命周期修复审查

范围仅processMotionCapability.ts、useReducedProcessMotion.ts、useReducedProcessMotion.test.ts及指定独立plan/schema-v3合同。未commit。

## 生产逐改

- processMotionCapability reader：旧每调用创建context但不清理。新把自建gl引用限定在函数内，finally尝试WEBGL_lose_context.loseContext；读取错误仍renderer:null，释放扩展不可用或抛错不改变原分类。未引用任何模块缓存/外部变量，保持page.evaluate序列化合同。临时探测context与img-fx自己的renderer区分，绝不释放动效实例。
- useReducedProcessMotion：旧lazy initializer和mount effect每个consumer各探测；新共享WeakMap<Document,string|null>只存稳定renderer信息，读取失败null也缓存，换Document重探测。每个hook原matchMedia change监听与cleanup保留，动态偏好不缓存；新consumer/StrictMode/重挂载不会新增GPU探测。
- 没动动效数量、GPU判断规则、进度UI或img-fx runtime。没有新增全局事件引擎。

## 红绿与真实性

新增初始5反例先红：成功与异常context释放、序列化释放、8consumer SSR复用、真实React StrictMode多consumer。最后一例原32 probes / 0 releases，修后1 / 1。再加不可释放扩展与失败能力缓存/新Document边界，最终19项通过。

真实浏览器生命周期测试使用真实React18 StrictMode、Chromium、matchMedia动态切换，GPU能力接口模拟为hardware以验证reduced true/false切换；该测试不是硬件性能数据。另直接实际ChromiumGPU探测序列化执行：ANGLE SwiftShader renderer，contexts=1/releases=1，验证真实WebGL释放路径。

日志 /tmp/nomi-process-motion-probe-red.log、/tmp/nomi-process-motion-probe-green.log；scoped eslint与tsconfig.app noEmit通过。合同提前shape校验仅缺未实施生产artifact（预期）；实现后本合同不再报错，父任务另一份waiting-grid合同尚未改生产时checker曾红，统一gate由父任务跑。

## 限制

Document存活期间不主动发现GPU切换；刷新窗口重探测。释放扩展不存在时浏览器负责回收。没有永久泄漏定量结论；修复的是已证明的重复probe和缺显式释放。原系统偏好订阅仍每consumer一份但及时cleanup，这不是GPU资源，暂不引入共享订阅复杂度。
