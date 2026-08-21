import type {
  CreateProductionRunInput,
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
};
