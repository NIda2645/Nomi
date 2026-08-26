// Source: https://agnes-ai.com/zh-Hans/docs/agnes-{20-flash,25-flash,25-pro-alpha,25-pro-beta,25-pro}
// Checked 2026-08-26. All five use the existing OpenAI-compatible chat SDK path,
// including streaming/tools and image_url input. Public coverage is not account eligibility.
export type AgnesTextModel = {
  modelKey: string;
  labelZh: string;
  meta: { supportsImageInput: true };
};

export const AGNES_TEXT_MODELS: AgnesTextModel[] = [
  ["agnes-2.0-flash", "Agnes 2.0 Flash"],
  ["agnes-2.5-flash", "Agnes 2.5 Flash"],
  ["agnes-2.5-pro-alpha", "Agnes 2.5 Pro Alpha"],
  ["agnes-2.5-pro-beta", "Agnes 2.5 Pro Beta"],
  ["agnes-2.5-pro", "Agnes 2.5 Pro"],
].map(([modelKey, labelZh]) => ({ modelKey, labelZh, meta: { supportsImageInput: true } }));
