import type { ModelParameterControl } from "../modelCatalogMeta";
import type { ModelArchetype } from "./types";

const options = (values: string[]) => values.map((value) => ({ value, label: value }));
const PIXEL_PARAMS: ModelParameterControl[] = [
  { key: "size", label: "尺寸", type: "select", options: options(["1024x1024", "1024x768", "768x1024", "1280x720", "720x1280", "1536x1024", "1024x1536"]), defaultValue: "1024x1024" },
];
const TIER_PARAMS: ModelParameterControl[] = [
  { key: "size", label: "清晰度", type: "select", options: options(["1K", "2K", "3K", "4K"]), defaultValue: "1K" },
  { key: "ratio", label: "比例", type: "select", options: options(["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"]), defaultValue: "1:1" },
];
const modes = (params: ModelParameterControl[]): ModelArchetype["modes"] => [
  { id: "t2i", intent: "text", vendorTerm: "文生图", hint: "纯文字生成图像", promptRequired: true, transportTaskKind: "text_to_image", slots: [], params },
  {
    id: "edit", intent: "edit", vendorTerm: "改图", hint: "给图（可多张）+ 提示词改图", promptRequired: true, transportTaskKind: "image_edit",
    // Official docs allow multiple inputs but publish no count limit.
    slots: [{ kind: "image_ref", label: "输入图", min: 1, inputKey: "image" }], params,
  },
];

export const AGNES_IMAGE_ARCHETYPE: ModelArchetype = {
  id: "agnes-image", family: "agnes-image", label: "Agnes Image 2.0", kind: "image",
  sources: [{ url: "https://agnes-ai.com/zh-Hans/docs/agnes-image-20-flash", checkedAt: "2026-08-26", vendorKey: "agnes", covers: "Pixel size; text/image/multiple references; extra_body.image; no documented reference count cap" }],
  defaultModeId: "t2i", transportTaskKind: "text_to_image", identifierPatterns: ["agnes-image", "agnes-image-2.0-flash"], modes: modes(PIXEL_PARAMS),
};

export const AGNES_IMAGE_21_ARCHETYPE: ModelArchetype = {
  legacyIds: ["agnes-image"],
  id: "agnes-image-2.1", family: "agnes-image", label: "Agnes Image 2.1", kind: "image",
  sources: [{ url: "https://agnes-ai.com/zh-Hans/docs/agnes-image-21-flash", checkedAt: "2026-08-26", vendorKey: "agnes", covers: "1K/2K/3K/4K with eight ratios; extra_body.image; no documented reference count cap" }],
  defaultModeId: "t2i", transportTaskKind: "text_to_image", identifierPatterns: ["agnes-image-2.1-flash"], modes: modes(TIER_PARAMS),
};
