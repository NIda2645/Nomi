import { getWorkspaceRepositoryDeps } from "../runtimePaths";
import { readWorkspaceProject, resolveWorkspaceProjectDir } from "../workspace/workspaceRepository";
import {
  ensureWorkspaceProjectIdentity,
  WorkspaceProjectIdentityUnavailableError,
  type WorkspaceProjectIdentity,
} from "../workspace/workspaceProjectIdentity";
import {
  createMainCapabilityExecutorRegistry,
  type CapabilityExecutorRegistry,
} from "./capabilityExecutorRegistry";
import { resolveVerifiedCapabilityExecutionTarget } from "./verifiedCapabilityInvocation";
import {
  createCanvasReadPortResolver,
  type DiskCanvasReadPortDeps,
} from "./canvasReadPortResolver";
import { type CanvasReadSurfaceRegistry } from "./canvasReadSurfaceRegistry";
import type { CapturedCanvasReadSnapshotRegistry } from './canvasReadCapturedSnapshotRegistry'
import {
  createCanvasReadSurfacePortRuntime,
  type CanvasReadSurfacePortRuntime,
} from "./canvasReadSurfacePort";

export type CanvasReadExecutionRuntime = Readonly<{
  executor: CapabilityExecutorRegistry;
  surfacePortRuntime?: CanvasReadSurfacePortRuntime;
}>;

export async function resolveProductionCanvasReadProjectIdentity(
  projectId: string,
): Promise<WorkspaceProjectIdentity> {
  const root = resolveWorkspaceProjectDir(projectId, getWorkspaceRepositoryDeps());
  if (!root) throw new WorkspaceProjectIdentityUnavailableError();
  const identity = await ensureWorkspaceProjectIdentity(root);
  if (identity.projectId !== projectId) throw new WorkspaceProjectIdentityUnavailableError();
  return identity;
}

export const productionDiskCanvasReadPortDeps: DiskCanvasReadPortDeps = Object.freeze({
  resolveProjectIdentity: resolveProductionCanvasReadProjectIdentity,
  readCanvas(projectId: string): unknown {
    const project = readWorkspaceProject(projectId, getWorkspaceRepositoryDeps());
    if (!project) throw new WorkspaceProjectIdentityUnavailableError();
    const payload = project.payload;
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).generationCanvas
      : undefined;
  },
});

/** Static GUI-main runtime; call once from registerIpc before any window opens. */
export function registerMainCanvasReadExecutionRuntime(input: Readonly<{
  surfaceRegistry: CanvasReadSurfaceRegistry;
  capturedSnapshots: CapturedCanvasReadSnapshotRegistry;
  disk?: DiskCanvasReadPortDeps;
}>): CanvasReadExecutionRuntime {
  const surfacePortRuntime = createCanvasReadSurfacePortRuntime({ registry: input.surfaceRegistry });
  const resolveCanvasReadPort = createCanvasReadPortResolver({
    disk: input.disk ?? productionDiskCanvasReadPortDeps,
    surfaceRegistry: input.surfaceRegistry,
    surfacePortRuntime,
    capturedSnapshots: input.capturedSnapshots,
  });
  return Object.freeze({
    executor: createMainCapabilityExecutorRegistry({
      resolveCanvasReadPort,
      resolveDocumentReadPort: async (invocation) => {
        const target = resolveVerifiedCapabilityExecutionTarget(invocation);
        if (target.kind !== "document-surface") throw new Error("capability_unsupported");
        return surfacePortRuntime.createDocumentReadPort(input.surfaceRegistry.captureProjectSessionPort(target.session), target.documentId);
      },
      resolveDocumentWritePort: async (invocation) => {
        const target = resolveVerifiedCapabilityExecutionTarget(invocation);
        if (target.kind !== "document-write-surface") throw new Error("capability_unsupported");
        return surfacePortRuntime.createDocumentWritePort(
          input.surfaceRegistry.captureProjectSessionPort(target.session),
          target.documentId,
        );
      },
      resolveCanvasWritePort: async (invocation) => {
        const target = resolveVerifiedCapabilityExecutionTarget(invocation);
        if (target.kind !== "canvas-write-surface") throw new Error("capability_unsupported");
        return surfacePortRuntime.createCanvasWritePort(
          input.surfaceRegistry.captureProjectSessionPort(target.session),
        );
      },
      resolveAssetReadPort: async (invocation) => {
        const target = resolveVerifiedCapabilityExecutionTarget(invocation);
        if (target.kind !== "asset-read-surface") throw new Error("capability_unsupported");
        return surfacePortRuntime.createAssetReadPort(input.surfaceRegistry.captureProjectSessionPort(target.session));
      },
      resolveExportReadPort: async (invocation) => {
        const target = resolveVerifiedCapabilityExecutionTarget(invocation);
        if (target.kind !== "export-read-surface") throw new Error("capability_unsupported");
        return surfacePortRuntime.createExportReadPort(input.surfaceRegistry.captureProjectSessionPort(target.session));
      },
      resolveExportWritePort: async (invocation) => {
        const target = resolveVerifiedCapabilityExecutionTarget(invocation);
        if (target.kind !== "export-write-surface") throw new Error("capability_unsupported");
        return surfacePortRuntime.createExportWritePort(
          input.surfaceRegistry.captureProjectSessionPort(target.session),
        );
      },
      resolveTimelineReadPort: async (invocation) => {
        const target = resolveVerifiedCapabilityExecutionTarget(invocation);
        if (target.kind !== "timeline-read-surface") throw new Error("capability_unsupported");
        return surfacePortRuntime.createTimelineReadPort(input.surfaceRegistry.captureProjectSessionPort(target.session));
      },
      resolveTimelineWritePort: async (invocation) => {
        const target = resolveVerifiedCapabilityExecutionTarget(invocation);
        if (target.kind !== "timeline-write-surface") throw new Error("capability_unsupported");
        return surfacePortRuntime.createTimelineWritePort(
          input.surfaceRegistry.captureProjectSessionPort(target.session),
        );
      },
    }),
    surfacePortRuntime,
  });
}

/** Standalone stdio/host runtime: disk is selected before execution; no renderer exists. */
export function createHeadlessCanvasReadExecutionRuntime(
  disk: DiskCanvasReadPortDeps = productionDiskCanvasReadPortDeps,
): CanvasReadExecutionRuntime {
  return Object.freeze({
    executor: createMainCapabilityExecutorRegistry({
      resolveCanvasReadPort: createCanvasReadPortResolver({ disk }),
    }),
  });
}
