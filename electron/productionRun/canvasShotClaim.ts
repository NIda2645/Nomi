// 画布提交前的镜头认领：画布要生成一个绑定了制作流程镜头的节点时，主进程先把这一镜持久地
// 认领给画布，认领不到就拒绝提交——同一镜不会被画布和制作流程各花一次钱。
// 判定只读 decideShotClaim（唯一判定口），落盘只走 Run reducer 的 `shot.claim`。
// 普通画布节点没有 run / shot 绑定，这里什么都不做，走原来的路。
import { decideShotClaim } from "../shared/decideShotClaim";
import { getRegisteredProductionRunService } from "./productionRunServiceRegistry";

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function claimCanvasProductionShot(projectId: string, extras: Record<string, unknown> | undefined): void {
  const productionRunId = text(extras?.productionRunId);
  const productionShotId = text(extras?.productionShotId);
  if (!projectId || !productionRunId || !productionShotId) return;
  const service = getRegisteredProductionRunService();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = service.repository.read(projectId, productionRunId);
    const decision = decideShotClaim(current, productionShotId, "canvas");
    if (!decision.granted) {
      throw Object.assign(new Error(`production_shot_claimed: ${decision.reason}`), {
        code: "production_shot_claimed", reason: decision.reason,
      });
    }
    // Only the shared decision may grant a canvas-owned claim. A missing or
    // mismatched shot is an ordinary canvas path and must never write a
    // plan-level claim that can lock the whole single-shot run.
    if (!current || decision.holder !== "canvas" || decision.reason === "canvas_claimed") return;
    try {
      service.repository.execute(projectId, productionRunId, {
        commandId: `shot.claim:${productionRunId}:${productionShotId}`,
        expectedRevision: current.revision,
        type: "shot.claim",
        payload: { shotId: productionShotId, by: "canvas" },
        issuedAt: new Date().toISOString(),
      });
      return;
    } catch (error) {
      // 并发改动让 revision 过期：重读一次再判；第二次还冲突就交给调用方。
      if (attempt === 1 || !/revision conflict/i.test(error instanceof Error ? error.message : String(error))) throw error;
    }
  }
}
