import { authHeaders } from "../ai/requestPipeline";
import { extractVendorExtraHeaders, readCatalog, normalizeProviderKind } from "../catalog/catalogStore";
import { resolveConnectionVendorKey } from "../catalog/connectionVendorKey";
import { connectionAuthSpec } from "../catalog/vendorAuthSpec";
import { desktopT } from "../i18n";
import type { AiSdkProviderKind } from "../catalog/types";
import type { ConnectionCertificationService } from "./service";
import type { IntegrationCandidate, IntegrationSession } from "./integrationSession";

/** Discover MCP candidates at the main-process boundary using only the saved credential. */
export async function discoverHttpCandidates(input: {
  session: IntegrationSession;
  certification: ConnectionCertificationService;
  credentialResolver?: (session: IntegrationSession) => string | undefined;
}): Promise<IntegrationCandidate[]> {
  const { session } = input;
  if (!session.config.baseUrl) throw new Error(desktopT("integration.discoveryMissingBaseUrl"));
  const apiKey = input.credentialResolver?.(session) || "";
  if (!apiKey) throw new Error(desktopT("integration.discoveryMissingCredential"));
  const providerKind = normalizeProviderKind(session.config.providerKind) as AiSdkProviderKind;
  const authType = session.config.authType || (providerKind === "anthropic" ? "x-api-key" : "bearer");
  // #831：同域名可以有多条连接，身份 = 域名 + 连接名。反查必须带上连接名，
  // 否则永远落到 host 那条，模型发现会拿错一把 Key。（2026-09-22 总合并：这条调用点取 #831 的；
  // 下面的方案词解析是本分支那一段，两件事不冲突——一件是「哪条连接」，一件是「它怎么签名」。）
  const catalogVendors = readCatalog().vendors;
  const vendorKey = resolveConnectionVendorKey({
    baseUrl: session.config.baseUrl,
    name: session.config.name,
    vendors: catalogVendors,
  });
  const vendor = catalogVendors.find((candidate) => candidate.key === vendorKey);
  // 方案词（Higgsfield 的 `Key id:secret`）只存在于已保存的那条连接上；接入向导没有填它的格子。
  const auth = connectionAuthSpec({
    baseUrl: session.config.baseUrl,
    authType,
    ...(session.config.authHeader ? { authHeader: session.config.authHeader } : {}),
    ...(session.config.authQueryParam ? { authQueryParam: session.config.authQueryParam } : {}),
  });
  try {
    const candidates = await input.certification.discoverHttpModels({
      baseUrl: session.config.baseUrl,
      providerKind,
      apiKey,
      auth,
      headers: {
        ...authHeaders(auth, apiKey),
        ...(vendor ? extractVendorExtraHeaders(vendor) || {} : {}),
      },
    });
    return candidates as IntegrationCandidate[];
  } catch (error) {
    const code = error instanceof Error ? error.message : "model_discovery_unknown";
    const reason = code.replace(/^model_discovery_/, "");
    const message = reason === "unsupported"
      ? desktopT("integration.discoveryUnsupported")
      : reason === "auth"
        ? desktopT("integration.discoveryAuthFailed")
        : desktopT("integration.discoveryFailed", { reason });
    throw new Error(message, { cause: error });
  }
}

export function applyDiscoveredCandidates(session: IntegrationSession, candidates: IntegrationCandidate[]): void {
  session.candidates = structuredClone(candidates);
  session.selections = [];
  session.unresolvedFields = candidates.length ? [] : [{ key: "models", reasonCode: "no_models_returned" }];
  session.stage = candidates.length ? "needs_selection" : "needs_input";
  session.blockingReason = candidates.length ? undefined : { code: "model_discovery_empty" };
}

export async function discoverAndPersistHttpCandidates<T>(input: {
  session: IntegrationSession;
  owner: string;
  expectedRevision: unknown;
  certification: ConnectionCertificationService;
  credentialResolver?: (session: IntegrationSession) => string | undefined;
  now: () => string;
  persist: () => void;
  project: () => T;
}): Promise<T> {
  if (input.session.ownerClientId !== input.owner) throw new Error("Integration session owner mismatch");
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== input.session.revision)
    throw new Error("Integration session revision is stale");
  const discovered = await discoverHttpCandidates(input);
  applyDiscoveredCandidates(input.session, discovered);
  input.session.revision += 1;
  input.session.updatedAt = input.now();
  input.persist();
  return input.project();
}
