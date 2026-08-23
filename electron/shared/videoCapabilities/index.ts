import { SEEDANCE_2_5_APIMART_ARCHETYPE } from "./seedance25Apimart";
import { SEEDANCE_2_APIMART_ARCHETYPE } from "./seedanceApimart";
import type { VideoModelCandidate } from "./recommendation";

/**
 * Source-backed candidates currently safe to recommend by default. Variants
 * remain separate candidates because their real model ids and parameter
 * ranges differ, while the capability shape remains shared.
 */
export const VIDEO_MODEL_CANDIDATES: readonly VideoModelCandidate[] = [
  { provider: "apimart", modelKey: "doubao-seedance-2.0", label: "Seedance 2.0", variantId: "standard", archetype: SEEDANCE_2_APIMART_ARCHETYPE },
  { provider: "apimart", modelKey: "doubao-seedance-2.0-fast", label: "Seedance 2.0 Fast", variantId: "fast", archetype: SEEDANCE_2_APIMART_ARCHETYPE },
  { provider: "apimart", modelKey: "doubao-seedance-2.0-mini", label: "Seedance 2.0 Mini", variantId: "mini", archetype: SEEDANCE_2_APIMART_ARCHETYPE },
  { provider: "apimart", modelKey: "doubao-seedance-2.5", label: "Seedance 2.5", archetype: SEEDANCE_2_5_APIMART_ARCHETYPE },
];

export { SEEDANCE_2_APIMART_ARCHETYPE, SEEDANCE_2_5_APIMART_ARCHETYPE };
export { recommendVideoGeneration } from "./recommendation";
export type {
  ArchetypeExpressionChannel,
  ArchetypeIntent,
  ArchetypeMode,
  ArchetypeReferenceSlot,
  ArchetypeReferenceSlotKind,
  ArchetypeSource,
  ModelArchetype,
  ModelArchetypeVariant,
  ModelParameterControl,
} from "./types";
export type {
  VideoGenerationRecommendation,
  VideoGenerationRecommendationInput,
  VideoGenerationRecommendationResult,
  VideoModelCandidate,
  VideoReferenceInput,
} from "./recommendation";
