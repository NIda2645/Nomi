import { synchronousSha256 } from "./synchronousSha256";

/**
 * 制作 Run 渲染层通道上的标识形状：projectId / runId / commandId / gateId / nodeId / shotId 都按它校验
 * （`electron/productionRun/productionRunIpc.ts` 的 `identifier`）。**唯一一份**——主进程校验、渲染层造命令号都从这里取。
 *
 * 为什么收成一处（2026-09-29，#921 真额度验收）：画布删镜头节点的上报命令号是渲染层手拼的
 * `detach-canvas:<runId>:<nodeIds>`，带「:」「,」，主进程这道校验一律拒（"Invalid command id"），渲染层又把错误吞了——
 * Run 里从来没记下 detach，被删的那一镜照样派发、照样扣费。规则和造号各写一份，两边就会各自漂；
 * 放在一处，造出来的号按构造就过得了校验，改规则的人也看得见谁在造号。
 */
export const PRODUCTION_RUN_IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]{1,160}$/;

export function isProductionRunIdentifier(value: string): boolean {
  return PRODUCTION_RUN_IDENTIFIER_PATTERN.test(value) && value !== "." && value !== "..";
}

/**
 * 「用户把这几个占位节点从画布删掉了」那条 `plan.detach-shot-nodes` 的命令号。
 *
 * - 同一 Run、同一组节点 → 永远同一个号：仓库按命令号幂等，同一次删除上报两遍（冲突重发、窗口重开）只记一次；
 * - 号的长度固定、字符恒在校验集内：runId 与节点 id 只进摘要，不原样拼进号里——runId 自己就可以长到 160，
 *   原样拼进去会超长，而超长和非法字符在主进程那一头是同一种拒绝。
 */
export function detachShotNodesCommandId(runId: string, nodeIds: readonly string[]): string {
  const digest = synchronousSha256(JSON.stringify([runId, [...new Set(nodeIds)].sort()])).slice(0, 32);
  return `detach-canvas.${digest}`;
}
