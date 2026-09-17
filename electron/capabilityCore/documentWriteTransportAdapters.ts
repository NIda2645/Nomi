import { CAPABILITY_TRANSPORT_PUBLIC_ERROR_CODES } from "../shared/surfacePortBinding";
import type { RuntimeToolCall, RuntimeToolDecision } from "../shared/agentCapabilities/transportContracts";
import {
  documentWriteOperationForAlias,
  type DocumentWriteInput,
} from "../shared/agentCapabilities/documentWrite";
import type { DocumentAnchorRef, PreconditionSet, TargetRef } from "../shared/capabilityTargeting";
import type { CapabilityExecutorRegistry } from "./capabilityExecutorRegistry";
import type { CanvasReadSurfaceRegistry, ProjectSurfaceSession } from "./canvasReadSurfaceRegistry";
import {
  createRendererDocumentWriteVerifiedInvocationFactory,
  type VerifiedCapabilityInvocation,
} from "./verifiedCapabilityInvocation";

export type PreparedDocumentWrite = Readonly<{
  call: RuntimeToolCall;
  invocation: VerifiedCapabilityInvocation<
    DocumentWriteInput,
    Readonly<{ kind: "document"; documentId: string; anchor: DocumentAnchorRef }>
  >;
}>;

export type PiDocumentWriteTransportAdapter = Readonly<{
  prepare(
    call: RuntimeToolCall,
    input: Readonly<{ documentId: string; target: TargetRef; preconditions: PreconditionSet }>,
    signal: AbortSignal,
  ): Promise<PreparedDocumentWrite | null>;
  execute(prepared: PreparedDocumentWrite, signal: AbortSignal): Promise<RuntimeToolDecision>;
  dispose(): void;
}>;

function safeFailure(error: unknown): Extract<RuntimeToolDecision, { ok: false }> {
  const code = error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "capability_execution_failed";
  // C4：放行清单从 owner 派生，不再手抄。这一份以前少了 `capability_target_stale`
  // 与 `project_identity_unavailable`（documentRead 那份连 receipt_unresolved 也少——同一张表抄两遍抄出两个数）。
  const published = CAPABILITY_TRANSPORT_PUBLIC_ERROR_CODES.has(code) ? code : "capability_execution_failed";
  return { ok: false, code: published, message: published };
}

/**
 * 把回合里的 target 变成文稿写的地址：用户站在创作页时 target 就是带锚的文稿；站在画布/预览时
 * target 是那个面自己的（节点/片段），文稿写就落到整篇（whole-document）。两种都是当下真实的前提。
 */
function documentTarget(target: TargetRef, documentId: string): Extract<TargetRef, { kind: "document" }> {
  if (target.kind !== "document") return { kind: "document", documentId, anchor: { kind: "whole-document" } };
  if (target.documentId !== documentId) throw new Error("capability_input_invalid");
  return target;
}

export function createPiDocumentWriteTransportAdapter(input: Readonly<{
  registry: CanvasReadSurfaceRegistry;
  session: ProjectSurfaceSession;
  requestId: string;
  executor: Pick<CapabilityExecutorRegistry, "execute">;
}>): PiDocumentWriteTransportAdapter {
  const factory = createRendererDocumentWriteVerifiedInvocationFactory({
    registry: input.registry,
    session: input.session,
    requestId: input.requestId,
  });
  let disposed = false;
  return Object.freeze({
    async prepare(call, context, signal) {
      const args = call.args && typeof call.args === "object" ? call.args as Record<string, unknown> : {};
      const operation = documentWriteOperationForAlias(call.toolName)
        ?? (call.toolName === "nomi_document_edit" && typeof args.operation === "string"
          && ["insert", "replace", "append"].includes(args.operation) ? args.operation as "insert" | "replace" | "append" : undefined);
      if (!operation) return null;
      if (disposed) throw new Error("surface_port_unavailable");
      signal.throwIfAborted();
      const target = documentTarget(context.target, context.documentId);
      const content = typeof args.content === "string" ? args.content : "";
      const invocation = await factory.mint({
        toolCallId: call.toolCallId,
        documentId: target.documentId,
        anchor: target.anchor,
        preconditions: context.preconditions,
        input: { operation, content },
      });
      return Object.freeze({ call, invocation });
    },
    async execute(prepared, signal) {
      if (disposed) return { ok: false, code: "surface_port_unavailable", message: "surface_port_unavailable" };
      try {
        const result = await input.executor.execute(prepared.invocation, { signal });
        return { ok: true, result, silent: true };
      } catch (error) {
        return safeFailure(error);
      }
    },
    dispose() { disposed = true; },
  });
}
