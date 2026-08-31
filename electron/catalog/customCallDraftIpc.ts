import { trim } from "../jsonUtils";
import {
  createCustomCallDraft,
  finalizeCustomCallDraft,
  type CustomCallDraftIdentity,
} from "./customCallDraft";
import type { BillingModelKind } from "./types";

type RegisterSyncIpc = (channel: string, handler: (...args: never[]) => unknown) => void;
type DraftActions = {
  create: typeof createCustomCallDraft;
  finalize: typeof finalizeCustomCallDraft;
};

const KINDS = new Set<BillingModelKind>(["text", "image", "video", "audio", "model3d"]);

function cleanKind(value: unknown): BillingModelKind {
  const kind = String(value || "") as BillingModelKind;
  return KINDS.has(kind) ? kind : "text";
}

function projectIdentity(identity: CustomCallDraftIdentity): CustomCallDraftIdentity {
  return {
    vendorKey: identity.vendorKey,
    modelKey: identity.modelKey,
    label: identity.label,
    kind: identity.kind,
  };
}

export function registerCustomCallDraftIpc(
  registerSyncIpc: RegisterSyncIpc,
  actions: DraftActions = { create: createCustomCallDraft, finalize: finalizeCustomCallDraft },
): void {
  registerSyncIpc("nomi:model-catalog:custom-call:draft-create", ((payload: unknown) => {
    const raw = (payload || {}) as Record<string, unknown>;
    try {
      const identity = actions.create({
        vendorName: trim(raw.vendorName),
        baseUrl: trim(raw.baseUrl),
        apiKey: trim(raw.apiKey),
        authType: raw.authType === "none" ? "none" : "bearer",
        modelKey: trim(raw.modelKey),
        kind: cleanKind(raw.kind),
      });
      return { ok: true, identity: projectIdentity(identity) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }) as (...args: never[]) => unknown);

  registerSyncIpc("nomi:model-catalog:custom-call:draft-finalize", ((payload: unknown) => {
    const raw = (payload || {}) as Record<string, unknown>;
    try {
      const identity = actions.finalize({
        vendorKey: trim(raw.vendorKey),
        modelKey: trim(raw.modelKey),
        script: trim(raw.script),
      });
      return { ok: true, identity: projectIdentity(identity) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }) as (...args: never[]) => unknown);
}
