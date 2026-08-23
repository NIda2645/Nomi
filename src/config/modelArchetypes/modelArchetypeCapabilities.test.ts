import { describe, expect, it } from "vitest";
import { SEEDANCE_2_APIMART_ARCHETYPE } from "./seedanceApimart";
import { SEEDANCE_2_5_APIMART_ARCHETYPE } from "./seedance25Apimart";

describe("model capability facts", () => {
  it("declares Seedance camera expression as prompt/reference-video, never native trajectory", () => {
    const mode = SEEDANCE_2_APIMART_ARCHETYPE.modes.find((item) => item.id === "omni");
    expect(mode?.cameraControl).toEqual({ strategy: "prompt_or_reference_video", nativeIntents: [] });
  });

  it("keeps Seedance 2.0 audio dependency in the mode slot declaration", () => {
    const omni = SEEDANCE_2_APIMART_ARCHETYPE.modes.find((item) => item.id === "omni");
    expect(omni?.slots.find((slot) => slot.kind === "audio_ref")?.requiresAnyOf)
      .toEqual(["image_ref", "video_ref"]);
  });

  it("does not assume Seedance 2.5 has the Seedance 2.0 audio dependency", () => {
    const omni = SEEDANCE_2_5_APIMART_ARCHETYPE.modes.find((item) => item.id === "omni");
    expect(omni?.slots.find((slot) => slot.kind === "audio_ref")?.requiresAnyOf).toBeUndefined();
  });
});
