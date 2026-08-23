import { describe, expect, it } from "vitest";
import { SEEDANCE_2_APIMART_ARCHETYPE } from "./seedanceApimart";
import { SEEDANCE_2_5_APIMART_ARCHETYPE } from "./seedance25Apimart";
import { recommendVideoGeneration, type VideoModelCandidate } from "./videoGenerationRecommendation";
import type { ArchetypeCameraControl, ModelArchetype } from "./types";

const seedance20: VideoModelCandidate = {
  provider: "apimart",
  modelKey: "doubao-seedance-2.0",
  label: "Seedance 2.0",
  archetype: SEEDANCE_2_APIMART_ARCHETYPE,
  variantId: "standard",
};

const seedance25: VideoModelCandidate = {
  provider: "apimart",
  modelKey: "doubao-seedance-2.5",
  label: "Seedance 2.5",
  archetype: SEEDANCE_2_5_APIMART_ARCHETYPE,
};

const withModeCameraControl = (
  candidate: VideoModelCandidate,
  modeId: string,
  cameraControl: ArchetypeCameraControl,
): VideoModelCandidate => ({
  ...candidate,
  archetype: {
    ...candidate.archetype,
    modes: candidate.archetype.modes.map((mode) => mode.id === modeId ? { ...mode, cameraControl } : mode),
  } satisfies ModelArchetype,
});

const withAudioSlotDependency = (
  candidate: VideoModelCandidate,
  requiresAnyOf: NonNullable<NonNullable<ModelArchetype["modes"][number]["slots"][number]["requiresAnyOf"]>> | undefined,
): VideoModelCandidate => ({
  ...candidate,
  archetype: {
    ...candidate.archetype,
    modes: candidate.archetype.modes.map((mode) => mode.id === "omni"
      ? {
          ...mode,
          slots: mode.slots.map((slot) => slot.kind === "audio_ref" ? { ...slot, requiresAnyOf } : slot),
        }
      : mode),
  } satisfies ModelArchetype,
});

describe("APIMart video recommendation", () => {
  it("prefers a character/reference mode over text-to-video when the user supplies a character image", () => {
    const result = recommendVideoGeneration(
      {
        prompt: "让角色走向镜头",
        references: [{ kind: "image", role: "character" }],
        goals: { preserveCharacter: true },
      },
      [seedance20],
    );

    expect(result.recommendations[0]).toMatchObject({ modelKey: "doubao-seedance-2.0", modeId: "omni" });
    expect(result.recommendations[0]?.reasons.join(" ")).toContain("角色参考图");
    expect(result.recommendations[0]?.params).toMatchObject({ resolution: "720p", duration: 5, generate_audio: true });
  });

  it("chooses first/last mode when both endpoints are supplied", () => {
    const result = recommendVideoGeneration(
      {
        prompt: "从白天过渡到夜晚",
        references: [
          { kind: "image", role: "first_frame" },
          { kind: "image", role: "last_frame" },
        ],
        goals: { preserveTransition: true, durationSeconds: 8 },
      },
      [seedance20],
    );

    expect(result.recommendations[0]).toMatchObject({ modeId: "firstlast" });
    expect(result.recommendations[0]?.params.duration).toBe(8);
    expect(result.recommendations[0]?.params.image_with_roles).toBeUndefined();
  });

  it("uses text-to-video only when no reference assets are provided", () => {
    const result = recommendVideoGeneration({ prompt: "一只猫在窗边打哈欠" }, [seedance20]);

    expect(result.recommendations[0]).toMatchObject({ modeId: "t2v" });
  });

  it("does not invent a trajectory-control mode for camera intent", () => {
    const result = recommendVideoGeneration(
      {
        prompt: "镜头环绕角色一周",
        cameraIntent: "orbit",
      },
      [seedance20],
    );

    expect(result.recommendations[0]?.modeId).toBe("t2v");
    expect(result.recommendations[0]?.limitations.join(" ")).toContain("通过提示词");
    expect(result.recommendations[0]?.limitations.join(" ")).not.toContain("trajectory");
  });

  it("keeps Seedance 2.5 first/last size fixed to the provider-required adaptive value", () => {
    const result = recommendVideoGeneration(
      {
        prompt: "从白天过渡到夜晚",
        references: [
          { kind: "image", role: "first_frame" },
          { kind: "image", role: "last_frame" },
        ],
        goals: { preserveTransition: true, aspectRatio: "16:9" },
      },
      [seedance25],
    );

    expect(result.recommendations[0]).toMatchObject({ modelKey: "doubao-seedance-2.5", modeId: "firstlast" });
    expect(result.recommendations[0]?.params.size).toBe("adaptive");
    expect(result.recommendations[0]?.editableParams).not.toContain("size");
    expect(result.recommendations[0]?.limitations.join(" ")).toContain("adaptive");
  });

  it("prefers the Seedance model whose real duration range contains the user's target", () => {
    const result = recommendVideoGeneration(
      { prompt: "一个持续 20 秒的长镜头", goals: { durationSeconds: 20 } },
      [seedance20, seedance25],
    );

    expect(result.recommendations[0]).toMatchObject({ modelKey: "doubao-seedance-2.5", modeId: "t2v", params: { duration: 20 } });
    expect(result.recommendations.find((item) => item.modelKey === "doubao-seedance-2.0")?.limitations.join(" ")).toContain("超出");
  });

  it("does not recommend an audio-only Seedance 2.0 request when the provider requires an image or video reference", () => {
    const result = recommendVideoGeneration(
      {
        prompt: "让音乐驱动画面节奏",
        references: [{ kind: "audio", role: "audio" }],
        goals: { useReferenceAudio: true },
      },
      [seedance20],
    );

    expect(result.recommendations).toHaveLength(0);
    expect(result.nextAction).toContain("参考图或参考视频");
  });

  it("does not claim trajectory is unavailable when the selected mode declares native orbit", () => {
    const nativeOrbit = withModeCameraControl(seedance20, "t2v", { strategy: "native", nativeIntents: ["orbit"] });
    const result = recommendVideoGeneration({ prompt: "环绕镜头", cameraIntent: "orbit" }, [nativeOrbit]);

    expect(result.recommendations[0]?.limitations.join(" ")).not.toContain("没有独立的轨迹控制");
  });

  it("derives audio-only support from reference-slot dependencies, not the provider name", () => {
    const audioOnly = withAudioSlotDependency(seedance20, undefined);
    const result = recommendVideoGeneration({ references: [{ kind: "audio", role: "audio" }] }, [audioOnly]);

    expect(result.recommendations).not.toHaveLength(0);
  });

  it("returns a generic unsupported-input action when all candidates reject the reference combination", () => {
    const result = recommendVideoGeneration({ references: [{ kind: "audio", role: "audio" }] }, [seedance20]);

    expect(result.nextAction).toContain("参考图或参考视频");
    expect(result.nextAction).not.toContain("APIMart Seedance");
  });
});
