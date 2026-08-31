import { describe, expect, it } from "vitest";
import { getComfyuiClientId, isCanonicalPromptId, resolveComfyuiPromptId } from "./clientSession";

describe("ComfyUI client session", () => {
  it("进程内 client id 稳定且不再是固定 nomi", () => {
    expect(getComfyuiClientId()).toBe(getComfyuiClientId());
    expect(getComfyuiClientId()).toMatch(/^nomi-[0-9a-f-]{36}$/);
  });

  it("保留合法 prompt UUID，非法值由主进程补 UUID", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(resolveComfyuiPromptId(id)).toBe(id);
    expect(isCanonicalPromptId(resolveComfyuiPromptId("nomi"))).toBe(true);
    expect(isCanonicalPromptId("123E4567-E89B-42D3-A456-426614174000")).toBe(false);
  });
});
