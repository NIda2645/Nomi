import { describe, expect, it } from "vitest";
import { SEEDANCE_2_APIMART_ARCHETYPE as rendererSeedance20 } from "../../../src/config/modelArchetypes/seedanceApimart";
import {
  SEEDANCE_2_APIMART_ARCHETYPE,
  VIDEO_MODEL_CANDIDATES,
  recommendVideoGeneration,
} from "./index";

describe("shared video capability registry", () => {
  it("exposes the same source-backed profile to renderer and shared consumers", () => {
    expect(rendererSeedance20).toBe(SEEDANCE_2_APIMART_ARCHETYPE);
    expect(VIDEO_MODEL_CANDIDATES.map((candidate) => candidate.modelKey)).toEqual([
      "doubao-seedance-2.0",
      "doubao-seedance-2.0-fast",
      "doubao-seedance-2.0-mini",
      "doubao-seedance-2.5",
    ]);
  });

  it("recommends from facts without any provider or app dependency", () => {
    const result = recommendVideoGeneration({
      prompt: "从首帧自然过渡到尾帧",
      references: [
        { kind: "image", role: "first_frame" },
        { kind: "image", role: "last_frame" },
      ],
    }, VIDEO_MODEL_CANDIDATES);

    expect(result.recommendations[0]).toMatchObject({ provider: "apimart", modeId: "firstlast" });
  });
});
