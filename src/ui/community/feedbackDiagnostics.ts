import type { DesktopAppInfo } from '../../desktop/bridge'
import { getAppLocale } from '../../i18n'
import { isKnownVendor } from '../../config/knownVendors'
import { isComfyuiVendorKey } from '../../workbench/generationCanvas/model/comfyuiVendor'
import { safeFeedbackValue, type FeedbackDraft, type FeedbackOpenRequest } from './feedbackTypes'

export type FeedbackDiagnostics = {
  version: 1
  app: {
    version: string
    platform: string
    arch: string
    locale: string
  }
  context: {
    intent: FeedbackDraft['intent']
    stage: FeedbackDraft['stage']
    errorKind?: string
    provider?: string
    model?: string
  }
}

/**
 * A user-defined vendor's key is minted from their own input — either a slug of the
 * base URL (`deriveVendorKeyFromBaseUrl`, e.g. an internal `internal-proxy-corp-local`)
 * or a slug of the instance name (`AddComfyuiInstanceButton` → `comfyui-local-<name>`).
 * Feedback leaves the app (Tally hidden fields / GitHub), so the provider slot must NEVER
 * carry that private string. Built-in vendors (curated registry + fixed internal literals)
 * are safe identities and pass through verbatim; everything else collapses to the literal
 * `"custom"`, and the user-typed model key is dropped with it.
 *
 * ComfyUI is a special case: the base literal `comfyui-local` is fixed, but the multi-instance
 * suffix is a user-typed name — so any comfyui key normalizes to the bare literal, and its
 * model key (also user-typed) is dropped, keeping the provider identity without the private name.
 */
const SAFE_INTERNAL_VENDOR_KEYS: ReadonlySet<string> = new Set(['dreamina', 'codex-local', 'antigravity-cli'])

type SanitizedProvider = { provider?: string; model?: string }

function sanitizeProviderIdentity(rawProvider?: string, rawModel?: string): SanitizedProvider {
  const provider = safeFeedbackValue(rawProvider)
  const model = safeFeedbackValue(rawModel)
  if (!provider) {
    // No vendor context (e.g. feedback opened from About, not a failed node): nothing to leak.
    return model ? { model } : {}
  }
  if (isKnownVendor(provider) || SAFE_INTERNAL_VENDOR_KEYS.has(provider)) {
    // Curated/built-in identity — a stable literal, no user input. Model key is a seeded archetype.
    return { provider, ...(model ? { model } : {}) }
  }
  if (isComfyuiVendorKey(provider)) {
    // Local ComfyUI: keep the fixed base literal, drop the user-typed instance suffix and model id.
    return { provider: 'comfyui-local' }
  }
  // User-defined relay / manual vendor: the key encodes their base-url or alias → never carry it.
  return { provider: 'custom' }
}

export function buildFeedbackDiagnostics(
  request: FeedbackOpenRequest,
  draft: Pick<FeedbackDraft, 'intent' | 'stage'>,
  appInfo?: Partial<DesktopAppInfo> | null,
): FeedbackDiagnostics {
  const { provider, model } = sanitizeProviderIdentity(request.provider, request.model)
  return {
    version: 1,
    app: {
      version: safeFeedbackValue(appInfo?.version) ?? 'unknown',
      platform: safeFeedbackValue(appInfo?.platform) ?? 'unknown',
      arch: safeFeedbackValue(appInfo?.arch) ?? 'unknown',
      locale: getAppLocale(),
    },
    context: {
      intent: draft.intent,
      stage: draft.stage,
      errorKind: safeFeedbackValue(request.errorKind),
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
    },
  }
}
