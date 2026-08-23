import { describe, expect, it } from "vitest";
import { SEEDANCE_2_APIMART_ARCHETYPE as rendererSeedance20 } from "../../../src/config/modelArchetypes/seedanceApimart";
import {
  SEEDANCE_2_APIMART_ARCHETYPE,
  buildVideoModelCandidates,
  recommendVideoGeneration,
} from "./index";

describe("shared video capability registry", () => {
  it("exposes the same source-backed profile to renderer and shared consumers", () => {
    expect(rendererSeedance20).toBe(SEEDANCE_2_APIMART_ARCHETYPE);
    const candidates = buildVideoModelCandidates([
      { provider: "apimart", modelKey: "doubao-seedance-2.0", label: "Seedance 2.0" },
      { provider: "apimart", modelKey: "doubao-seedance-2.0-fast", label: "Seedance 2.0 Fast" },
      { provider: "apimart", modelKey: "doubao-seedance-2.0-mini", label: "Seedance 2.0 Mini" },
    ]);
    expect(candidates.map((candidate) => candidate.modelKey)).toEqual([
      "doubao-seedance-2.0",
      "doubao-seedance-2.0-fast",
      "doubao-seedance-2.0-mini",
    ]);
    expect(candidates.map((candidate) => candidate.variantId)).toEqual(["standard", "fast", "mini"]);
  });

  it("recommends from facts without any provider or app dependency", () => {
    const candidates = buildVideoModelCandidates([
      { provider: "apimart", modelKey: "doubao-seedance-2.0", label: "Seedance 2.0" },
    ]);
    const result = recommendVideoGeneration({
      prompt: "从首帧自然过渡到尾帧",
      references: [
        { kind: "image", role: "first_frame" },
        { kind: "image", role: "last_frame" },
      ],
    }, candidates);

    expect(result.recommendations[0]).toMatchObject({ provider: "apimart", modeId: "firstlast" });
  });

  it("keeps an unverified catalog model usable without inventing advanced reference capabilities", () => {
    const [candidate] = buildVideoModelCandidates([
      { provider: "new-provider", modelKey: "new-video-model", label: "New video model" },
    ]);
    expect(candidate?.archetype.modes.map((mode) => mode.id)).toEqual(["t2v", "i2v"]);
    expect(candidate?.archetype.modes.flatMap((mode) => mode.expressionChannels ?? [])).toEqual([
      expect.objectContaining({ signal: "camera_motion", status: "unknown" }),
      expect.objectContaining({ signal: "camera_motion", status: "unknown" }),
    ]);
    expect(recommendVideoGeneration({ references: [{ kind: "image", role: "character" }] }, [candidate!]).recommendations[0]?.modeId).toBe("i2v");
    expect(recommendVideoGeneration({ references: [{ kind: "image", role: "first_frame" }, { kind: "image", role: "last_frame" }] }, [candidate!]).recommendations).toHaveLength(0);
  });
});
