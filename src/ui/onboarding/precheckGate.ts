// 接入类动作的「预检门槛」决策（纯函数，全项目唯一真相源）。
//
// 产品决策（2026-06-14 用户拍板 manual 接入 → 2026-08-11 扩到 ComfyUI 全线，R3）：
// **预检一律非阻断**。我们可以先替用户跑检查、可以把风险说清楚，但**不替用户做决定**——
// 检查没过时按钮改「仍要…」走二次确认（arm→confirm），而不是把人死拦在门外。
//
// 为什么（两类误判都真实发生过，且都不是用户的错）：
//   · 连通性预检：/models 未实现、代理抖动、自建网关不认探测请求 → 端点其实能用却被判失败。
//   · 缺件预检：/object_info 只认「本机此刻装了什么」。用户可能正打算边下模型边配、
//     模型装在别的路径/别的机器、或那个缺的输入本来就要暴露成参数在生成时另填。
//   （用户 2026-08-11 原话：「comfyui 文件是否缺失不做强制检测，api 接入也不做强制检测」。）
//
// 此前 manual 接入曾把保存硬拦在 testState==='ok'（commit dbe6665），与设计相左，已收口到本函数；
// ComfyUI 的预置模板/模板库同样把「缺件」做成了死门（disabled），2026-08-11 一并收口到这里。
// UI 只按本函数渲染按钮，杜绝门槛条件散落在各组件里各写一套。
//
// 唯一还该真 disabled 的，是**结构上做不成**的事（必填项没填、正在忙、已经做过了）——
// 那不是预检，是这个动作根本无处着手。判据放调用方的 actionable 里。

export type PrecheckGateAction =
  | "disabled" // 结构上做不成（必填项未齐 / 正在忙 / 已做过）→ 不可点
  | "proceed" // 预检通过 → 直接执行
  | "arm" // 预检未过/未跑、首次点击 → 进入二次确认（不执行）
  | "confirm"; // 已 armed、再次点击 → 明知风险仍执行

export type PrecheckGateInput = {
  /** 结构上能不能动手：必填项齐 && 不在忙 && 没重复做。false 才是真 disabled。 */
  actionable: boolean;
  /** 预检通过（连通性 OK / 缺件为零）。未跑过也算 false —— 未跑 ≠ 不给做。 */
  precheckPassed: boolean;
  /** 已进入「仍要…」的二次确认态。 */
  forceArmed: boolean;
};

export function resolvePrecheckGateAction(input: PrecheckGateInput): PrecheckGateAction {
  if (!input.actionable) return "disabled";
  if (input.precheckPassed) return "proceed";
  return input.forceArmed ? "confirm" : "arm";
}
