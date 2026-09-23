import { safeTransportFailure } from "./transportFailure";
import { CAPABILITY_TRANSPORT_PUBLIC_ERROR_CODES } from "../shared/surfacePortBinding";
import type { RuntimeToolCall, RuntimeToolDecision } from "../shared/agentCapabilities/transportContracts";
import { documentReadScopeForAlias } from "../shared/agentCapabilities/documentRead";
import type { CapabilityExecutorRegistry } from "./capabilityExecutorRegistry";
import type { CanvasReadSurfaceRegistry, ProjectSurfaceSession } from "./canvasReadSurfaceRegistry";
import { createRendererDocumentReadVerifiedInvocationFactory } from "./verifiedCapabilityInvocation";

export type PiDocumentReadTransportAdapter = Readonly<{
  tryExecute(call: RuntimeToolCall, documentId: string, signal: AbortSignal): Promise<RuntimeToolDecision | null>;
  dispose(): void;
}>;

// C4：放行清单从 owner 派生，不再手抄。这一份以前少了 `capability_receipt_unresolved`
// 与 `capability_target_stale`，两者都被静默替换成 `capability_execution_failed`。
function safeFailure(error: unknown): Extract<RuntimeToolDecision, { ok: false }> {
  return safeTransportFailure(error, { allowedCodes: CAPABILITY_TRANSPORT_PUBLIC_ERROR_CODES, fallbackCode: "capability_execution_failed" });
}

export function createPiDocumentReadTransportAdapter(input: Readonly<{
  registry: CanvasReadSurfaceRegistry;
  session: ProjectSurfaceSession;
  requestId: string;
  executor: Pick<CapabilityExecutorRegistry, "execute">;
}>): PiDocumentReadTransportAdapter {
  const factory = createRendererDocumentReadVerifiedInvocationFactory({
    registry: input.registry,
    session: input.session,
    requestId: input.requestId,
  });
  let disposed = false;
  return Object.freeze({
    async tryExecute(call, documentId, signal) {
      const scope = documentReadScopeForAlias(call.toolName)
        ?? (call.toolName === "nomi_document_read" && call.args && typeof call.args === "object"
          && (call.args as Record<string, unknown>).scope === "selection" ? "selection" : undefined)
        ?? (call.toolName === "nomi_document_read" ? "full" : undefined);
      if (!scope) return null;
      if (disposed) return { ok: false, code: "surface_port_unavailable", message: "surface_port_unavailable" };
      try {
        const invocation = await factory.mint({ toolCallId: call.toolCallId, documentId, input: { scope } });
        const result = await input.executor.execute(invocation, { signal });
        return { ok: true, result, silent: true };
      } catch (error) {
        return safeFailure(error);
      }
    },
    dispose() { disposed = true; },
  });
}
