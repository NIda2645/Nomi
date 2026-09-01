import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Model, Vendor } from "./catalog/types";
import type { TaskRequest } from "./runtime";

const mocks = vi.hoisted(() => ({
  streamTextTask: vi.fn(),
  findExecutableModelForTask: vi.fn(),
}));

vi.mock("./ai/streamTextTask", () => ({ streamTextTask: mocks.streamTextTask }));
vi.mock("./runtime", () => ({
  billingKindForTaskKind: () => "text",
  findExecutableModelForTask: mocks.findExecutableModelForTask,
}));

import { executeTextTask, runTextTaskStream } from "./textTaskRunner";

const genericReference = "https://cdn.example.com/generic-reference.png";

function modelSelection(vendorKey: string, modelKey: string) {
  return {
    vendor: { key: vendorKey } as Vendor,
    model: { modelKey } as Model,
    apiKey: "test-key",
  };
}

function imagePromptRequest(modelKey: string): TaskRequest {
  return {
    kind: "image_to_prompt",
    prompt: "Describe this image",
    extras: {
      modelKey,
      modelVendor: "comfyui-local",
      parameterReferenceSlots: {
        vendorKey: "comfyui-local",
        modelKey,
        slots: [{ key: "comfy_image_1", label: "Image", group: "reference", mediaKind: "image" }],
      },
      comfy_image_1: null,
      referenceImages: [genericReference],
    },
  };
}

describe("text image selection identity", () => {
  beforeEach(() => {
    mocks.streamTextTask.mockReset().mockResolvedValue({ text: "description", raw: { ok: true } });
    mocks.findExecutableModelForTask.mockReset();
  });

  it("direct execution ignores a stale Comfy contract for the selected non-Comfy model", async () => {
    const selected = modelSelection("openai-compatible", "vision-model");
    await executeTextTask({ ...selected, kind: "image_to_prompt", request: imagePromptRequest("vision-model"), taskId: "direct" });

    // image_to_prompt 现走多图（视频拆解一镜 3 帧）；单图调用方降为单元素数组，语义不变。
    expect(mocks.streamTextTask.mock.calls[0]?.[0]).toMatchObject({ imageUrls: [genericReference] });
  });

  it("stream execution ignores a stale Comfy contract for the selected non-Comfy model", async () => {
    const selected = modelSelection("openai-compatible", "vision-model");
    mocks.findExecutableModelForTask.mockReturnValue(selected);
    await runTextTaskStream({ vendor: selected.vendor.key, request: imagePromptRequest("vision-model") });

    expect(mocks.streamTextTask.mock.calls[0]?.[0]).toMatchObject({ imageUrls: [genericReference] });
  });

  it("direct execution keeps a selected Comfy pending slot empty instead of using a generic fallback", async () => {
    const selected = modelSelection("comfyui-local", "workflow-model");
    await executeTextTask({ ...selected, kind: "image_to_prompt", request: imagePromptRequest("workflow-model"), taskId: "direct" });

    // Comfy 待填槽（null）→ 契约要求留空，不落通用兜底图。多图入口下应连 imageUrls 都不带。
    expect(mocks.streamTextTask.mock.calls[0]?.[0]).not.toHaveProperty("imageUrls");
  });

  it("stream execution keeps a selected Comfy pending slot empty instead of using a generic fallback", async () => {
    const selected = modelSelection("comfyui-local", "workflow-model");
    mocks.findExecutableModelForTask.mockReturnValue(selected);
    await runTextTaskStream({ vendor: selected.vendor.key, request: imagePromptRequest("workflow-model") });

    expect(mocks.streamTextTask.mock.calls[0]?.[0]).not.toHaveProperty("imageUrls");
  });
});
