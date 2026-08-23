import type {
  ArchetypeIntent,
  ArchetypeMode,
  ModelArchetype,
  ModelParameterControl,
} from "./types";
import type { VideoModelCandidate } from "./recommendation";
import { SEEDANCE_2_5_APIMART_ARCHETYPE } from "./seedance25Apimart";
import { SEEDANCE_2_APIMART_ARCHETYPE } from "./seedanceApimart";

/**
 * The catalog is the user's source of truth for which models actually exist.
 * This deliberately contains no catalog-store or Electron imports so the same
 * resolver can be used by GUI and headless planning tests.
 */
export type VideoCatalogModel = {
  provider: string;
  modelKey: string;
  label: string;
  parameterControls?: readonly ModelParameterControl[];
};

const SOURCE_BACKED_PROFILES: readonly ModelArchetype[] = [
  SEEDANCE_2_APIMART_ARCHETYPE,
  SEEDANCE_2_5_APIMART_ARCHETYPE,
];

function modelMatchesProfile(modelKey: string, profile: ModelArchetype): boolean {
  const normalized = modelKey.trim().toLowerCase();
  return profile.identifierPatterns.some((pattern) => {
    const candidate = pattern.trim().toLowerCase();
    return candidate.length > 0 && (normalized === candidate || normalized.includes(candidate));
  });
}

function controlsFor(model: VideoCatalogModel): ModelParameterControl[] {
  return (model.parameterControls ?? []).map((control) => ({
    ...control,
    options: control.options.map((option) => ({ ...option })),
  }));
}

function unknownExpressionMode(input: {
  id: string;
  intent: ArchetypeIntent;
  vendorTerm: string;
  hint: string;
  slots: ArchetypeMode["slots"];
  promptRequired: boolean;
  transportTaskKind: NonNullable<ArchetypeMode["transportTaskKind"]>;
  params: ModelParameterControl[];
}): ArchetypeMode {
  return {
    ...input,
    expressionChannels: [{ signal: "camera_motion", via: "prompt", status: "unknown" }],
  };
}

/**
 * Conservative profile for a catalog model that has no source-backed profile.
 * It keeps the model usable for the common text/image paths while refusing to
 * invent first/last-frame, omni, motion-reference or native camera support.
 */
function unknownVideoArchetype(model: VideoCatalogModel): ModelArchetype {
  const params = controlsFor(model);
  return {
    id: `catalog-video-${model.provider}-${model.modelKey}`,
    family: "unknown",
    label: model.label,
    kind: "video",
    defaultModeId: "t2v",
    transportTaskKind: "text_to_video",
    identifierPatterns: [model.modelKey],
    modes: [
      unknownExpressionMode({
        id: "t2v",
        intent: "text",
        vendorTerm: "文生视频",
        hint: "当前模型目录声明的视频生成入口；高级参考能力尚未对账",
        slots: [],
        promptRequired: true,
        transportTaskKind: "text_to_video",
        params,
      }),
      unknownExpressionMode({
        id: "i2v",
        intent: "single",
        vendorTerm: "图生视频",
        hint: "单张参考图驱动；其他参考角色尚未对账",
        slots: [{ kind: "image_ref", label: "参考图", min: 1, max: 1, inputKey: "image_urls" }],
        promptRequired: true,
        transportTaskKind: "image_to_video",
        params,
      }),
    ],
  };
}

function profileFor(model: VideoCatalogModel): ModelArchetype {
  return SOURCE_BACKED_PROFILES.find((profile) => modelMatchesProfile(model.modelKey, profile)) ?? unknownVideoArchetype(model);
}

function variantFor(model: VideoCatalogModel, archetype: ModelArchetype): string | undefined {
  return archetype.variants?.find((variant) => variant.modelKey === model.modelKey)
    ?.id ?? archetype.defaultVariantId;
}

/**
 * Resolve the current catalog into recommendation candidates. The returned
 * list changes when the user changes provider/model; no provider-name branch
 * or fixed candidate list is required by the recommender.
 */
export function buildVideoModelCandidates(models: readonly VideoCatalogModel[]): VideoModelCandidate[] {
  return models
    .filter((model) => model.provider.trim() && model.modelKey.trim())
    .map((model) => {
      const archetype = profileFor(model);
      return {
        provider: model.provider,
        modelKey: model.modelKey,
        label: model.label || model.modelKey,
        archetype,
        ...(variantFor(model, archetype) ? { variantId: variantFor(model, archetype) } : {}),
      };
    });
}

export function sourceBackedVideoProfiles(): readonly ModelArchetype[] {
  return SOURCE_BACKED_PROFILES;
}
