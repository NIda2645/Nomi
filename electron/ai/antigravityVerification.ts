import type { AntigravityTestRequest } from "../shared/antigravity";
import type { AntigravityResult } from "./antigravityProtocol";
import type { runAntigravityProcess } from "./antigravityProcess";

// Deterministic 64x64 red PNG, no user file or external URL is used for verification.
export const ANTIGRAVITY_TEST_IMAGE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3PAQkAAAyEwO9feoshgnABdLep8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3IPanc8OLDQitxAAAAAElFTkSuQmCC", "base64");

export async function verifyAntigravityCapability(request: AntigravityTestRequest, version: string, signal: AbortSignal,
  run: (input: Parameters<typeof runAntigravityProcess>[0]) => Promise<AntigravityResult>): Promise<AntigravityResult> {
  const prompts = {
    text: "Reply with exactly OK.",
    vision: "Inspect the supplied image with view_file. Reply with only its dominant color in English, uppercase.",
    image: "Generate one image of a red origami crane on a white tabletop. No text or watermark.",
    edit: "Edit the supplied reference image: replace its red color with blue, keeping the square composition. Generate one image.",
  };
  const result = await run({ prompt: prompts[request.capability], capability: request.capability, model: request.modelId,
    cliVersion: version, signal,
    ...(["vision", "edit"].includes(request.capability) ? { images: [{ bytes: ANTIGRAVITY_TEST_IMAGE, mimeType: "image/png" }] } : {}),
  });
  if ((request.capability === "text" && result.text.trim() !== "OK")
    || (request.capability === "vision" && result.text.trim().toUpperCase() !== "RED")) {
    throw new Error("ANTIGRAVITY_TEST_ASSERTION_FAILED");
  }
  if (["image", "edit"].includes(request.capability)
    && !(result as AntigravityResult & { artifacts?: unknown[] }).artifacts?.length) {
    throw new Error("ANTIGRAVITY_TEST_ARTIFACT_MISSING");
  }
  return result;
}
