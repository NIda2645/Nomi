// Renderer compatibility export. The pure recommender is shared with the
// main-process planning owner to keep recommendation rules single-sourced.
export {
  recommendVideoGeneration,
} from "../../../electron/shared/videoCapabilities/recommendation";
export type {
  VideoGenerationRecommendation,
  VideoGenerationRecommendationInput,
  VideoGenerationRecommendationResult,
  VideoModelCandidate,
  VideoReferenceInput,
} from "../../../electron/shared/videoCapabilities/recommendation";
