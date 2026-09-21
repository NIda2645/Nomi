import { safeTransportFailure } from "./transportFailure";
import { CAPABILITY_TRANSPORT_PUBLIC_ERROR_CODES } from "../shared/surfacePortBinding";
import type { RuntimeToolCall, RuntimeToolDecision } from "../shared/agentCapabilities/transportContracts";
import { assetReadInputForAlias, type AssetReadInput } from "../shared/agentCapabilities/assetRead";
import {
  exportReadInputForAlias,
  exportWriteInputForAlias,
  type ExportReadInput,
  type ExportWriteInput,
} from "../shared/agentCapabilities/exportCapabilities";
import type { TargetRef } from "../shared/capabilityTargeting";
import type { CapabilityExecutorRegistry } from "./capabilityExecutorRegistry";
import type { CanvasReadSurfaceRegistry, ProjectSurfaceSession } from "./canvasReadSurfaceRegistry";
import {
  createRendererAssetReadVerifiedInvocationFactory,
  createRendererExportReadVerifiedInvocationFactory,
  createRendererExportWriteVerifiedInvocationFactory,
  type VerifiedCapabilityInvocation,
} from "./verifiedCapabilityInvocation";

// C4：放行清单从 owner 派生。这一份以前少了 `project_identity_unavailable`。
const PUBLIC_FAILURE_CODES = CAPABILITY_TRANSPORT_PUBLIC_ERROR_CODES;

function safeFailure(error: unknown): Extract<RuntimeToolDecision, { ok: false }> {
  return safeTransportFailure(error, { allowedCodes: PUBLIC_FAILURE_CODES, fallbackCode: "capability_execution_failed" });
}

type Phase4ReadInput = AssetReadInput | ExportReadInput;
type Phase4ReadTarget = Extract<TargetRef, { kind: "asset" | "export" }>;

export type PreparedExportWrite = Readonly<{
  call: RuntimeToolCall;
  invocation: VerifiedCapabilityInvocation<ExportWriteInput, Extract<TargetRef, { kind: "export" }>>;
}>;

export type PiPhase4SurfaceTransportAdapter = Readonly<{
  tryExecuteRead(call: RuntimeToolCall, signal: AbortSignal): Promise<RuntimeToolDecision | null>;
  prepareWrite(call: RuntimeToolCall, signal: AbortSignal): Promise<PreparedExportWrite | null>;
  executeWrite(
    prepared: PreparedExportWrite,
    approval: Readonly<{ receiptProposalId: string; approvalId: string; actionHash: string }>,
    signal: AbortSignal,
  ): Promise<RuntimeToolDecision>;
  dispose(): void;
}>;

export function createPiPhase4SurfaceTransportAdapter(input: Readonly<{
  registry: CanvasReadSurfaceRegistry;
  session: ProjectSurfaceSession;
  requestId: string;
  executor: Pick<CapabilityExecutorRegistry, "execute">;
}>): PiPhase4SurfaceTransportAdapter {
  const assetFactory = createRendererAssetReadVerifiedInvocationFactory(input);
  const exportReadFactory = createRendererExportReadVerifiedInvocationFactory(input);
  const exportWriteFactory = createRendererExportWriteVerifiedInvocationFactory(input);
  let disposed = false;
  return Object.freeze({
    async tryExecuteRead(call, signal) {
      let semanticInput: Phase4ReadInput | undefined;
      let kind: "asset" | "export" | undefined;
      try {
        semanticInput = assetReadInputForAlias(call.toolName, call.args);
        if (semanticInput) kind = "asset";
        else {
          semanticInput = exportReadInputForAlias(call.toolName, call.args);
          if (semanticInput) kind = "export";
        }
      } catch {
        return { ok: false, code: "capability_input_invalid", message: "capability_input_invalid" };
      }
      if (!semanticInput || !kind) return null;
      if (disposed) return { ok: false, code: "surface_port_unavailable", message: "surface_port_unavailable" };
      try {
        const invocation = kind === "asset"
          ? await assetFactory.mint({ toolCallId: call.toolCallId, input: semanticInput })
          : await exportReadFactory.mint({ toolCallId: call.toolCallId, input: semanticInput });
        const result = await input.executor.execute(
          invocation as VerifiedCapabilityInvocation<Phase4ReadInput, Phase4ReadTarget>,
          { signal },
        );
        return { ok: true, result, silent: true };
      } catch (error) {
        return safeFailure(error);
      }
    },
    async prepareWrite(call, signal) {
      let semanticInput: ExportWriteInput | undefined;
      try {
        semanticInput = exportWriteInputForAlias(call.toolName, call.args);
      } catch {
        throw Object.assign(new Error("capability_input_invalid"), { code: "capability_input_invalid" });
      }
      if (!semanticInput) return null;
      if (disposed) throw Object.assign(new Error("surface_port_unavailable"), { code: "surface_port_unavailable" });
      if (signal.aborted) throw Object.assign(new Error("capability_cancelled"), { code: "capability_cancelled" });
      const invocation = await exportWriteFactory.mint({ toolCallId: call.toolCallId, input: semanticInput });
      return Object.freeze({ call, invocation });
    },
    async executeWrite(prepared, approval, signal) {
      if (disposed) return { ok: false, code: "surface_port_unavailable", message: "surface_port_unavailable" };
      try {
        const result = await input.executor.execute(prepared.invocation, { signal, approval });
        return { ok: true, result, silent: true };
      } catch (error) {
        return safeFailure(error);
      }
    },
    dispose() {
      disposed = true;
    },
  });
}
