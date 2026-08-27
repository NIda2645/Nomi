import { describe, expect, it } from "vitest";
import { derivePublishedExecution } from "./modelPublication";

const model = (kind: string, extra: Record<string, unknown> = {}) => ({
  vendorKey: "relay",
  modelKey: `${kind}-model`,
  kind,
  enabled: true,
  ...extra,
});

describe("published execution contract", () => {
  it("keeps the adapter-less legacy fallback text-only", () => {
    expect(derivePublishedExecution(model("text"))).toEqual({ published: true, publishedModes: ["chat"] });
    for (const kind of ["image", "video", "audio", "model3d"]) {
      expect(derivePublishedExecution(model(kind))).toEqual({ published: false, publishedModes: [] });
    }
  });

  it("derives exact media modes from enabled executable mappings", () => {
    expect(derivePublishedExecution(model("image"), {
      mappings: [
        { vendorKey: "relay", modelKey: "image-model", taskKind: "text_to_image", enabled: true },
        { vendorKey: "relay", modelKey: "image-model", taskKind: "image_edit", enabled: false },
      ],
    })).toEqual({ published: true, publishedModes: ["text_to_image"] });
  });

  it("publishes an active revision without inventing failed modes", () => {
    expect(derivePublishedExecution(model("video", {
      meta: { adapter: { state: "failed", activeRevision: "revision-good", modes: [] } },
    }))).toEqual({ published: true, publishedModes: [] });
  });

  it("keeps an active text revision on its direct chat path while repair modes are temporarily empty", () => {
    expect(derivePublishedExecution(model("text", {
      meta: { adapter: { state: "testing", activeRevision: "revision-good", modes: [] } },
    }))).toEqual({ published: true, publishedModes: ["chat"] });
  });

  it("publishes a legacy generic custom-call script only for the minimal default mode", () => {
    expect(derivePublishedExecution(model("image", { customCall: { script: "return 'image'" } })))
      .toEqual({ published: true, publishedModes: ["text_to_image"] });
    expect(derivePublishedExecution(model("video", { customCall: { script: "return 'video'" } })))
      .toEqual({ published: true, publishedModes: ["text_to_video"] });
  });

  it("requires taskKind or capability-contract evidence for mode-specific custom-call publication", () => {
    expect(derivePublishedExecution(model("image", {
      customCall: { modes: { mystery: { script: "return 'unknown'" } } },
    }))).toEqual({ published: false, publishedModes: [] });
    expect(derivePublishedExecution(model("image", {
      customCall: { modes: { image_edit: { script: "return 'edited'" } } },
    }))).toEqual({ published: false, publishedModes: [] });
    expect(derivePublishedExecution(model("video", {
      customCall: { modes: { create: { script: "return 'created'" }, reference: { script: "return 'reference'" } } },
      meta: { customCapabilityContract: {
        version: 1,
        defaultModeId: "create",
        transportTaskKind: "text_to_video",
        modes: [
          { id: "create" },
          { id: "reference", transportTaskKind: "image_to_video" },
        ],
      } },
    }))).toEqual({ published: true, publishedModes: ["text_to_video", "image_to_video"] });
  });

  it("combines the generic default with independently proven mode-specific scripts", () => {
    expect(derivePublishedExecution(model("image", {
      customCall: {
        script: "return 'created'",
        modes: { edit: { script: "return 'edited'" } },
      },
      meta: { customCapabilityContract: {
        version: 1,
        defaultModeId: "create",
        transportTaskKind: "text_to_image",
        modes: [
          { id: "create" },
          { id: "edit", transportTaskKind: "image_edit" },
        ],
      } },
    }))).toEqual({ published: true, publishedModes: ["text_to_image", "image_edit"] });
  });

  it("does not publish mode scripts from a malformed capability contract the runtime cannot execute", () => {
    expect(derivePublishedExecution(model("image", {
      customCall: { modes: { edit: { script: "return 'edited'" } } },
      meta: { customCapabilityContract: {
        version: 1,
        modes: [{ id: "edit", transportTaskKind: "image_edit" }],
      } },
    }))).toEqual({ published: false, publishedModes: [] });
  });

  it("publishes only the scripted taskKind proven by a built-in capability archetype", () => {
    expect(derivePublishedExecution({
      ...model("image"),
      modelKey: "seedream",
      customCall: { modes: { edit: { script: "return 'edited'" } } },
    })).toEqual({ published: true, publishedModes: ["image_edit"] });
  });
});
