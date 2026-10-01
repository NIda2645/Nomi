import type {
  CreateProductionRunInput,
  ProductionActionResult,
  ProductionShotActionResult,
  ProductionRun,
  ProductionRunSummary,
  RunCommand,
  RunCommandResult,
  RunEvent,
} from "../../electron/productionRun/productionRunTypes";
import type { MaterializeStoryboardResult } from "../../electron/productionRun/productionRunService";
import type { PendingSpendConfirm, PendingSpendRead, PendingSpendShot } from "../../electron/shared/contracts/pendingSpendConfirm";

export type { PendingSpendConfirm, PendingSpendRead, PendingSpendShot };

export type ProductionRunProjection = ProductionRun & { storyboardReferenceUrls?: Readonly<Record<string,string>> };

export type DesktopProductionRunBridge = {
  list: (projectId: string) => Promise<ProductionRunSummary[]>;
  read: (projectId: string, runId: string) => Promise<ProductionRunProjection | null>;
  createDraft: (input: Pick<CreateProductionRunInput, "projectId" | "playbook" | "origin">) => Promise<ProductionRunProjection>;
  command: (projectId: string, runId: string, command: RunCommand) => Promise<RunCommandResult>;
  materializeStoryboard: (projectId: string, runId: string, artifactId: string, expectedVersion: number) => Promise<MaterializeStoryboardResult>;
  events: (projectId: string, runId: string, afterCursor: number) => Promise<RunEvent[]>;
  // P4 S6：返工一镜 / 续拍已停批次。回结构化结果（渲染层 t() 翻译 code；绝不含密钥）。
  rework: (projectId: string, runId: string, shotId?: string) => Promise<ProductionShotActionResult>;
  resumeBatch: (projectId: string, runId: string) => Promise<ProductionShotActionResult>;
  /**
   * 2026-09-11 Agent 面板付费确认卡的四个通道。
   * `pendingSpend` 是**只读投影**（价格由宿主按目录算，渲染层不反推）；另外三个是动作。
   */
  pendingSpend: (projectId: string) => Promise<PendingSpendRead>;
  reviseSpend: (input: { projectId: string; operationId: string; quoteId: string; shotId?: string; patch: Record<string, unknown> }) => Promise<ProductionActionResult>;
  discardSpend: (projectId: string, operationId: string, quoteId: string) => Promise<ProductionActionResult>;
  /** 付费卡上「生成这张 / 这段」：只批这一镜。 */
  confirmSpend: (projectId: string, operationId: string, quoteId: string, shotId?: string) => Promise<ProductionActionResult>;
  /** 付费卡上「去掉这张 / 这段」：这一镜不生成。 */
  removeSpendShot: (projectId: string, operationId: string, quoteId: string, shotId: string) => Promise<ProductionActionResult>;
};
