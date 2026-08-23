import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMcpProtocol, type McpTransport } from "./mcpProtocol";
import { dispatch } from "./dispatcher";
import { createMcpGenerationPolicy } from "./mcpGenerationPolicy";
import { createGenerationPlanningHandler } from "./mcpGenerationTools";
import { createModuleRegistry } from "./moduleRegistry";
import { createProjectLeaseAuthority } from "./projectLease";
import { createProjectLeaseStore } from "./projectLeaseStore";
import { createProductionGenerationOperationStore } from "../productionRun/productionGenerationOperationStore";
import { createProductionRunRepository } from "../productionRun/productionRunRepository";
import { createProductionRunService } from "../productionRun/productionRunService";

const roots: string[] = [];
const registry = createModuleRegistry([{
  moduleId: "generation.single-shot",
  version: "1.0.0",
  inputKinds: ["text", "image"],
  outputKinds: ["image"],
  modes: ["text-to-image", "image-to-image"],
  parameterSchema: { aspectRatio: { type: "enum", enum: ["1:1", "16:9"] } },
  assetInputSchema: { references: { kind: "image", max: 4 } },
  providers: [{
    providerId: "fixture-provider",
    models: [{ modelId: "fixture-model", modes: ["text-to-image", "image-to-image"], parameterSchema: { seed: { type: "integer" } }, capabilities: { submitIdempotency: true, query: true, reconcile: true, cancel: true } }],
  }],
}]);

function makeAuthority(root: string) {
  return createProjectLeaseAuthority({
    macKey: "mcp-journey-authority",
    keyId: "mcp-journey-v1",
    store: createProjectLeaseStore({ filePath: path.join(root, "leases.json"), macKey: "mcp-journey-store", keyId: "mcp-journey-store-v1" }),
    now: () => "2026-08-23T00:00:00.000Z",
    randomId: (() => { let n = 0; return () => `lease-${++n}` })(),
  });
}

function makeCandidate() {
  return {
    candidateId: "candidate-journey",
    revision: 1,
    moduleId: "generation.single-shot",
    providerId: "fixture-provider",
    modelId: "fixture-model",
    mode: "text-to-image",
    prompt: "A quiet paper boat on a lake",
    parameters: { aspectRatio: "1:1", seed: 4 },
    references: [],
  };
}

class McpJourneyHarness {
  readonly invoke = vi.fn<(method: string, params: Record<string, unknown>) => Promise<unknown>>();
  private readonly protocol: ReturnType<typeof createMcpProtocol>;
  private readonly queue: Array<Record<string, unknown>> = [];
  private readonly waiters: Array<(message: Record<string, unknown>) => void> = [];

  constructor(invoke: (method: string, params: Record<string, unknown>) => Promise<unknown>) {
    this.invoke.mockImplementation(invoke);
    const transport: McpTransport = {
      send: (message) => {
        const frame = message as Record<string, unknown>;
        const waiter = this.waiters.shift();
        if (waiter) waiter(frame);
        else this.queue.push(frame);
      },
      invoke: this.invoke,
      isAppOpen: () => false,
    };
    this.protocol = createMcpProtocol(transport);
  }

  private next(): Promise<Record<string, unknown>> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async call(id: number, method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.protocol.handleIncoming({ jsonrpc: "2.0", id, method, params });
    const response = await this.next();
    expect(response.id).toBe(id);
    return response;
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("MCP semantic generation planning journey", () => {
  it("tools/call create → edit → preview reaches one durable Run and never reaches runTask", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nomi-mcp-generation-journey-"));
    roots.push(root);
    const repository = createProductionRunRepository({ projectDirResolver: () => root, now: () => "2026-08-23T00:00:00.000Z" });
    const service = createProductionRunService({ repository, projectRootResolver: () => root, sleep: async () => {} });
    const operations = createProductionGenerationOperationStore(service);
    const handler = createGenerationPlanningHandler({ registry, operations, now: () => "2026-08-23T00:00:00.000Z" });
    const authority = makeAuthority(root);
    const selection = authority.issueSelectionHandle({ immutableProjectUuid: "project-uuid", projectGeneration: 1, canonicalRootDigest: "root", manifestDigest: "manifest", scopeSet: ["generation:create", "generation:plan", "generation:preview", "generation:read"] });
    const lease = authority.issueLease(selection.token, { projectId: "project-1", leasePrincipal: "mcp:test", sessionId: "session-1", connectionNonce: "connection-1" }).token;
    const runTask = vi.fn(async () => { throw new Error("semantic planning must not call runTask"); });
    const context = {
      runTask,
      makeGateway: () => { throw new Error("semantic planning must not create a gateway"); },
      productionRuns: service,
      origin: { host: "codex" as const },
      generationPolicy: createMcpGenerationPolicy({ env: { NOMI_MCP_GENERATION_SINGLE_SHOT_V1: "1" }, checkpoints: { p0Passed: true, p2Passed: true } }),
      projectLeaseAuthority: authority,
      generationPlanning: handler,
    };
    const harness = new McpJourneyHarness((method, params) => dispatch(method, params, context));

    await harness.call(1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "Codex" } });
    const created = await harness.call(2, "tools/call", { name: "nomi_operation_create", arguments: { leaseHandle: lease, candidate: makeCandidate() } });
    expect(created.result).toBeTruthy();
    const operationId = [...(await repository.list("project-1"))][0]?.runId;
    expect(operationId).toMatch(/^op-/);

    await harness.call(3, "tools/call", { name: "nomi_submit_generation_plan", arguments: { leaseHandle: lease, operationId, patch: { mode: "image-to-image", references: [{ assetId: "asset-1", contentHash: "hash-1", version: 1 }], parameters: { aspectRatio: "16:9", seed: 9 } } } });
    const preview = await harness.call(4, "tools/call", { name: "nomi_preview_execution", arguments: { leaseHandle: lease, operationId } });
    expect(preview.result).toBeTruthy();
    expect(repository.read("project-1", operationId!).generationPlan).toMatchObject({ state: "draft", candidate: { revision: 2, mode: "image-to-image" } });
    expect(runTask).not.toHaveBeenCalled();
    expect(harness.invoke).toHaveBeenCalledWith("nomi_preview_execution", expect.objectContaining({ operationId }));
  });
});
