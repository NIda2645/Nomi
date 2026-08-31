import { describe, expect, it } from "vitest";
import {
  MINIMAX_H3_OFFICIAL_CREATE,
  MINIMAX_OFFICIAL_MAPPING_IDS,
  MINIMAX_OFFICIAL_MODELS,
  MINIMAX_VENDOR_SEED,
  normalizeMinimaxH3OfficialBody,
} from "./minimaxOfficial";

describe("MiniMax 官方合同", () => {
  it("uses the Open Platform .com host accepted by the scoped API key", () => {
    expect(MINIMAX_VENDOR_SEED.baseUrl).toBe("https://api.minimaxi.com");
    expect(MINIMAX_VENDOR_SEED.authHeader).toBe("Authorization");
  });

  it("serializes H3 multimodal content and rejects mixed frame/reference inputs", () => {
    const body = normalizeMinimaxH3OfficialBody({
      prompt: "a slow camera move",
      first_frame_url: "https://example.com/first.png",
      resolution: "768P",
      duration: 6,
    }) as Record<string, unknown>;
    expect(body.content).toEqual([
      { type: "text", text: "a slow camera move" },
      { type: "image_url", image_url: { url: "https://example.com/first.png" }, role: "first_frame" },
    ]);
    expect(body.ratio).toBe("adaptive");
    expect(() => normalizeMinimaxH3OfficialBody({
      prompt: "conflict",
      first_frame_url: "https://example.com/first.png",
      reference_image_urls: ["https://example.com/ref.png"],
    })).toThrow(/冲突/);
  });

  it("keeps the model identity and production endpoint in one mapping", () => {
    expect(MINIMAX_H3_OFFICIAL_CREATE.path).toBe("/v2/video_generation");
    expect(MINIMAX_H3_OFFICIAL_CREATE.body).toMatchObject({ model: "MiniMax-H3" });
  });

  it("keeps the static certification identity manifest in sync with every curated mapping", () => {
    expect([...MINIMAX_OFFICIAL_MAPPING_IDS].sort()).toEqual(
      MINIMAX_OFFICIAL_MODELS.flatMap((model) => model.mappings.map((mapping) => mapping.id)).sort(),
    );
  });
});
