import crypto from "node:crypto";
import type { ProviderAdapterRun, ProviderAdapterRegistration } from "../providerAdapter/types";
import { HttpProviderConnector } from "./httpConnector";
import type { CertificationChildRunRef, CertificationContractBinding, RemoteIdempotencyCapability } from "./types";

export type CertificationEntryPoint = "manual-ui" | "programmatic-session";
export type CanonicalHttpCertificationRun = Omit<ProviderAdapterRun, "connectionFingerprint"> & {
  schemaVersion: 1;
  kind: "http-api-provider";
  childRunRef: CertificationChildRunRef;
};

type HttpStartInput = {
  entryPoint: CertificationEntryPoint;
  idempotencyKey: string;
  connection: Omit<Parameters<HttpProviderConnector["start"]>[0], "certification">;
  remoteIdempotency?: RemoteIdempotencyCapability;
};

type ExistingHttpStartInput = {
  entryPoint: CertificationEntryPoint;
  idempotencyKey: string;
  vendorKey: string;
  models: Parameters<HttpProviderConnector["startExisting"]>[0]["models"];
  remoteIdempotency?: RemoteIdempotencyCapability;
};

function sha(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizedContract(value: unknown, parentKey = ""): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizedContract(item));
    return parentKey === "models"
      ? normalized.sort((left, right) => String((left as { modelKey?: unknown }).modelKey || "")
        .localeCompare(String((right as { modelKey?: unknown }).modelKey || "")))
      : normalized;
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "apiKey" && key !== "entryPoint" && key !== "certification")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [
        key,
        key === "baseUrl" && typeof item === "string"
          ? item.replace(/\/+$/, "")
          : normalizedContract(item, key),
      ]),
  );
}

function contractBinding(
  contract: unknown,
  idempotencyKey: string,
  remoteIdempotency: RemoteIdempotencyCapability = "unknown",
): CertificationContractBinding {
  return {
    contractDigest: sha(JSON.stringify(normalizedContract(contract))),
    idempotencyKey,
    remoteIdempotency,
  };
}

function publicRun(
  run: Omit<ProviderAdapterRun, "connectionFingerprint"> | ProviderAdapterRun,
  childRunRef: CertificationChildRunRef,
): CanonicalHttpCertificationRun {
  const projected = structuredClone(run) as Partial<ProviderAdapterRun>;
  delete projected.connectionFingerprint;
  return {
    ...(projected as Omit<ProviderAdapterRun, "connectionFingerprint">),
    schemaVersion: 1,
    kind: "http-api-provider",
    childRunRef,
  };
}

export class ConnectionCertificationService {
  private readonly http: HttpProviderConnector;

  constructor(dependencies: { http?: HttpProviderConnector } = {}) {
    this.http = dependencies.http || new HttpProviderConnector();
  }

  configureHttpConnection(input: Parameters<HttpProviderConnector["configure"]>[0]): ProviderAdapterRegistration {
    return this.http.configure(input);
  }

  async startHttp(input: HttpStartInput): Promise<CanonicalHttpCertificationRun> {
    const certification = contractBinding(input.connection, input.idempotencyKey, input.remoteIdempotency);
    const run = await this.http.start({ ...input.connection, certification });
    const childRunRef = this.http.childRunRef(run.id);
    if (!childRunRef) throw new Error("Canonical certification child run reference is missing");
    return publicRun(run, childRunRef);
  }

  async startExistingHttp(input: ExistingHttpStartInput) {
    const contract = { vendorKey: input.vendorKey, models: input.models };
    const certification = contractBinding(contract, input.idempotencyKey, input.remoteIdempotency);
    const result = await this.http.startExisting({ vendorKey: input.vendorKey, models: input.models, certification });
    if (!result.ok) return result;
    const childRunRef = this.http.childRunRef(result.run.id);
    if (!childRunRef) throw new Error("Canonical certification child run reference is missing");
    return { ok: true as const, run: publicRun(result.run, childRunRef) };
  }

  async retryHttp(input: { runId: string; modelKey?: string; idempotencyKey: string }) {
    const certification = contractBinding({ runId: input.runId, modelKey: input.modelKey || null }, input.idempotencyKey);
    const result = await this.http.retryExisting({
      runId: input.runId,
      ...(input.modelKey ? { modelKey: input.modelKey } : {}),
      certification,
    });
    if (!result.ok) return result;
    const childRunRef = this.http.childRunRef(result.run.id);
    if (!childRunRef) throw new Error("Canonical certification child run reference is missing");
    return { ok: true as const, run: publicRun(result.run, childRunRef) };
  }

  listExistingHttpModels(vendorKey: string) {
    return this.http.listExistingModels(vendorKey);
  }

  get(runId: string): CanonicalHttpCertificationRun | undefined {
    const ref = this.http.childRunRef(runId);
    if (!ref) return undefined;
    const run = this.http.get(runId);
    if (!run) return undefined;
    return publicRun(run, ref);
  }

  latest(vendorKey: string): CanonicalHttpCertificationRun | undefined {
    const run = this.http.latest(vendorKey);
    if (!run) return undefined;
    const ref = this.http.childRunRef(run.id);
    return ref ? publicRun(run, ref) : undefined;
  }

  cancel(runId: string): CanonicalHttpCertificationRun | undefined {
    const ref = this.http.childRunRef(runId);
    if (!ref) return undefined;
    const run = this.http.cancel(runId);
    if (!run) return undefined;
    return publicRun(run, ref);
  }

  list(options: { vendorKey?: string; activeOnly?: boolean; limit?: number } = {}): CanonicalHttpCertificationRun[] {
    return this.http.list(options).flatMap((run) => {
      const ref = this.http.childRunRef(run.id);
      return ref ? [publicRun(run, ref)] : [];
    });
  }

  resumeInterrupted(): void {
    this.http.resumeInterrupted();
  }
}

let singleton: ConnectionCertificationService | null = null;

export function getConnectionCertificationService(): ConnectionCertificationService {
  singleton ||= new ConnectionCertificationService();
  return singleton;
}
