import type { BillingModelKind, Model, ProfileKind } from "../catalog/types";
import { buildOpenAiCompatibleDraft } from "./builtinOpenAiCompatibleDraft";
import type { LoadedConnection } from "./serviceCatalog";
import type {
  AdapterModelDraft,
  AdapterModeResult,
  ProviderAdapterCompilation,
  ProviderAdapterDraft,
  ProviderAdapterRun,
} from "./types";

export const TEXT_PRODUCTION_PATH_CREATE = { method: "POST", path: "/chat/completions" } as const;
export const MANUAL_CONTRACT_ERROR = "No safe generic contract exists for this model kind; configure a manual call script";

export function primaryTaskKind(kind: BillingModelKind): ProfileKind {
  if (kind === "image") return "text_to_image";
  if (kind === "video") return "text_to_video";
  if (kind === "audio") return "text_to_audio";
  if (kind === "model3d") return "text_to_3d";
  return "chat";
}

export function emptyCompilation(connection: LoadedConnection): ProviderAdapterCompilation {
  return {
    draft: {
      provider: {
        baseUrl: String(connection.vendor.baseUrlHint || ""),
        authType: connection.vendor.authType || "bearer",
        ...(connection.vendor.providerKind ? { providerKind: connection.vendor.providerKind } : {}),
      },
      sources: [],
      models: [],
    },
    failures: [],
  };
}

export function genericCompilation(
  connection: LoadedConnection,
  models: readonly Model[],
): ProviderAdapterCompilation {
  const draft = buildOpenAiCompatibleDraft({
    baseUrl: String(connection.vendor.baseUrlHint || ""),
    authType: connection.vendor.authType || "bearer",
    ...(connection.vendor.providerKind ? { providerKind: connection.vendor.providerKind } : {}),
    models: models.map((model) => ({ modelKey: model.modelKey, labelZh: model.labelZh, kind: model.kind })),
  });
  const usable = draft.models.filter((model) => model.modes.length > 0);
  const unusable = draft.models.filter((model) => model.modes.length === 0);
  return {
    draft: { ...draft, models: usable },
    failures: unusable.map((model) => ({ modelKey: model.modelKey, error: MANUAL_CONTRACT_ERROR })),
  };
}

export function appendCompilation(
  current: ProviderAdapterCompilation,
  addition: ProviderAdapterCompilation,
  modelKey?: string,
): ProviderAdapterCompilation {
  const selectedModels = modelKey
    ? addition.draft.models.filter((model) => model.modelKey === modelKey)
    : addition.draft.models;
  const selectedFailures = modelKey
    ? addition.failures.filter((failure) => failure.modelKey === modelKey)
    : addition.failures;
  const sourceKey = (source: ProviderAdapterDraft["sources"][number]) => `${source.url}\0${source.evidence}`;
  const sources = [...current.draft.sources];
  const seenSources = new Set(sources.map(sourceKey));
  for (const source of addition.draft.sources) {
    if (seenSources.has(sourceKey(source))) continue;
    seenSources.add(sourceKey(source));
    sources.push(source);
  }
  return {
    draft: { ...current.draft, sources, models: [...current.draft.models, ...selectedModels] },
    failures: [...current.failures, ...selectedFailures],
  };
}

export function withTextModels(
  compiled: readonly AdapterModelDraft[],
  textModels: readonly Model[],
): AdapterModelDraft[] {
  const textModelKeys = new Set(textModels.map((model) => model.modelKey));
  return [
    ...compiled.filter((model) => !textModelKeys.has(model.modelKey)),
    ...textModels.map((model) => ({
      modelKey: model.modelKey,
      labelZh: model.labelZh,
      kind: "text" as const,
      modes: [{ taskKind: "chat" as const, create: TEXT_PRODUCTION_PATH_CREATE, testParams: {}, sourceUrls: [] }],
    })),
  ];
}

export function completedModelCount(models: readonly ProviderAdapterRun["models"][number][]): number {
  return models.filter((model) =>
    model.modes.length > 0 && model.modes.every((mode) => mode.state === "verified" || mode.state === "failed"),
  ).length;
}

export function failUnfinishedModes(
  models: ProviderAdapterRun["models"],
  stage: NonNullable<AdapterModeResult["stage"]>,
  error: string,
): ProviderAdapterRun["models"] {
  return models.map((model) => ({
    ...model,
    modes: model.modes.length === 0
      ? [{ taskKind: primaryTaskKind(model.kind), state: "failed", attempts: 1, stage, error }]
      : model.modes.map((mode) =>
          mode.state === "verified" || mode.state === "failed"
            ? mode
            : { ...mode, state: "failed", stage, error }),
  }));
}
