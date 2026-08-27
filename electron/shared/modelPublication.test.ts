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
});
