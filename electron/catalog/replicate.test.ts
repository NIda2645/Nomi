import { describe, expect, it } from "vitest";
import { REPLICATE_VENDOR_SEED } from "./replicate";

describe("replicate vendor seed", () => {
  it("裸 baseUrl 到 /v1 + bearer", () => {
    expect(REPLICATE_VENDOR_SEED.key).toBe("replicate");
    expect(REPLICATE_VENDOR_SEED.baseUrl).toBe("https://api.replicate.com/v1");
    expect(REPLICATE_VENDOR_SEED.authType).toBe("bearer");
  });
  it("本地图吞入走文件 API multipart，取 urls.get", () => {
    const ing = REPLICATE_VENDOR_SEED.assetIngestion as { strategy: string; endpoint: string; urlPath: string; fileField: string };
    expect(ing.strategy).toBe("upload-multipart");
    expect(ing.endpoint).toBe("https://api.replicate.com/v1/files");
    expect(ing.urlPath).toBe("urls.get");
    expect(ing.fileField).toBe("content");
  });
});
