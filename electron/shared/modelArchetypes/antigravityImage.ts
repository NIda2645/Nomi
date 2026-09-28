import type { ModelArchetype } from "./types";

/** App adapter contract for the official CLI tool, not an asserted image-model identity. */
export const ANTIGRAVITY_IMAGE_ARCHETYPE: ModelArchetype = {
  id: "antigravity-image", family: "antigravity-image", label: "Antigravity · generate_image", kind: "image",
  sources: [{ url: "https://antigravity.google/docs/hooks/", checkedAt: "2026-08-27", vendorKey: "antigravity-cli",
    covers: "generate_image Prompt/ImageName/ImagePaths; four reference limit is the Nomi adapter budget, not a claimed upstream limit" }],
  defaultModeId: "t2i", transportTaskKind: "text_to_image", identifierPatterns: ["antigravity-cli/generate_image"],
  modes: [
    { id: "t2i", intent: "text", vendorTerm: "文生图", hint: "通过官方 CLI 的 generate_image 工具生成一张图片", promptRequired: true,
      transportTaskKind: "text_to_image", slots: [], params: [] },
    { id: "i2i", intent: "edit", vendorTerm: "改图", hint: "Nomi 每次最多处理四张参考图", promptRequired: true,
      transportTaskKind: "image_edit", slots: [{ kind: "image_ref", label: "参考图", min: 1, max: 4,
        inputKey: "reference_images" }], params: [] },
  ],
};
