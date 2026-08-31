import type {
  CreateProductionRunInput,
  ProductionActionResult,
  ProductionRun,
  ProductionRunSummary,
  RunCommand,
  RunCommandResult,
  RunEvent,
} from "../../electron/productionRun/productionRunTypes";
import type { MaterializeStoryboardResult } from "../../electron/productionRun/productionRunService";

export type ProductionRunProjection = ProductionRun;

export type DesktopProductionRunBridge = {
  list: (projectId: string) => Promise<ProductionRunSummary[]>;
  read: (projectId: string, runId: string) => Promise<ProductionRunProjection | null>;
  createDraft: (input: Pick<CreateProductionRunInput, "projectId" | "playbook" | "origin">) => Promise<ProductionRunProjection>;
  command: (projectId: string, runId: string, command: RunCommand) => Promise<RunCommandResult>;
  materializeStoryboard: (projectId: string, runId: string, artifactId: string, expectedVersion: number) => Promise<MaterializeStoryboardResult>;
  events: (projectId: string, runId: string, afterCursor: number) => Promise<RunEvent[]>;
  // P4 S6：返工一镜 / 续拍已停批次。回结构化结果（渲染层 t() 翻译 code；绝不含密钥）。
  rework: (projectId: string, runId: string, shotId?: string) => Promise<ProductionActionResult>;
  resumeBatch: (projectId: string, runId: string, reason: "budget" | "manual") => Promise<ProductionActionResult>;
};
