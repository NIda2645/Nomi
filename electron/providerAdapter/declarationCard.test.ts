// 声明卡 §5 新增的那几格：**卡上能声明的，运行期才可能做到**。
//
// 每条断言配一条阳性对照：不这么做的话，「schema 通过」说不清是判对了还是压根没判。
import { describe, expect, it } from "vitest";
import { adapterSuppliedContractSchema, validateProviderAdapterDraft } from "./validator";
import { DECLARABLE_INGESTION_STRATEGIES } from "./declarationCard";

const SOURCE = "https://docs.relay.example/images";

function card(overrides: Record<string, unknown> = {}) {
  return {
    sources: [{ url: SOURCE, evidence: "POST /images returns data[0].url" }],
    assetIngestion: { strategy: "none", sourceUrl: SOURCE },
    models: [{
      modelKey: "relay-paint",
      labelZh: "Relay Paint",
      kind: "image",
      modes: [{
        taskKind: "text_to_image",
        create: { method: "POST", path: "/images", body: { prompt: "{{request.prompt}}" }, response_mapping: { image_url: "data.0.url" } },
        sourceUrls: [SOURCE],
      }],
    }],
    ...overrides,
  };
}

function draft(overrides: Record<string, unknown> = {}) {
  const { assetIngestion, ...rest } = card(overrides);
  return {
    provider: { baseUrl: "https://api.relay.example", authType: "bearer" },
    assetIngestion,
    ...rest,
    ...overrides,
  };
}

const options = { providerBaseUrl: "https://api.relay.example", selectedModelKeys: ["relay-paint"] };

describe("声明卡 §5", () => {
  it("assetIngestion 必填：没声明 = 卡不合格，不是「用兜底」", () => {
    const { assetIngestion: _omitted, ...without } = card();
    expect(adapterSuppliedContractSchema.safeParse(without).success).toBe(false);
    // 【阳性对照】显式 none 通过——「这家不收本地素材」是一句合法的声明。
    expect(adapterSuppliedContractSchema.safeParse(card()).success).toBe(true);
  });

  it("声明面不含 comfyui-upload / anon-chain（本地专属通道与跨供应商互借的匿名图床）", () => {
    expect(DECLARABLE_INGESTION_STRATEGIES).not.toContain("comfyui-upload" as never);
    expect(DECLARABLE_INGESTION_STRATEGIES).not.toContain("anon-chain" as never);
    expect(adapterSuppliedContractSchema.safeParse(card({
      assetIngestion: { strategy: "anon-chain", sourceUrl: SOURCE },
    })).success).toBe(false);
  });

  it("上传初始化端点必须与绑定同源——它是第二个带 key 的出口", () => {
    expect(() => validateProviderAdapterDraft(draft({
      assetIngestion: {
        strategy: "upload-initiate-put",
        endpoint: "https://uploads.other.example/v1/uploads",
        uploadUrlPath: "upload_url",
        urlPath: "url",
        sourceUrl: SOURCE,
      },
    }), options)).toThrow(/same origin/);
    // 【阳性对照】同源的同一条声明通过。
    expect(() => validateProviderAdapterDraft(draft({
      assetIngestion: {
        strategy: "upload-initiate-put",
        endpoint: "https://api.relay.example/v1/uploads",
        uploadUrlPath: "upload_url",
        urlPath: "url",
        sourceUrl: SOURCE,
      },
    }), options)).not.toThrow();
  });

  it("selfCheck 探针不许是生成端点——自检必须免费", () => {
    expect(() => validateProviderAdapterDraft(draft({
      selfCheck: { kind: "liveness-probe", request: { method: "POST", path: "/images" }, successPath: "ok", sourceUrl: SOURCE },
    }), options)).toThrow(/never spends/);
    // 【阳性对照】指向一条真正免费的端点就通过（Higgsfield 那类「/models 不权威」的家靠它）。
    expect(() => validateProviderAdapterDraft(draft({
      selfCheck: { kind: "liveness-probe", request: { method: "GET", path: "/v1/me" }, successPath: "id", sourceUrl: SOURCE },
    }), options)).not.toThrow();
  });

  it("selfCheck 探针也要同源（它带着 key）", () => {
    expect(() => validateProviderAdapterDraft(draft({
      selfCheck: { kind: "liveness-probe", request: { method: "GET", path: "https://other.example/me" }, successPath: "id", sourceUrl: SOURCE },
    }), options)).toThrow(/same origin/);
  });

  it("authScheme / omitted / parameters[].sourceUrl 都能声明得出来（Higgsfield 那类接得进来）", () => {
    const parsed = validateProviderAdapterDraft({
      ...draft({ omitted: [{ field: "seed", reason: "not exposed on this plan", sourceUrl: SOURCE }] }),
      provider: { baseUrl: "https://api.relay.example", authType: "bearer", authScheme: "Key" },
      models: [{
        ...card().models[0],
        parameters: [{ key: "quality", label: "Quality", type: "select", options: [{ value: "hd", label: "HD" }], sourceUrl: SOURCE }],
      }],
    }, options);
    expect(parsed.provider.authScheme).toBe("Key");
    expect(parsed.omitted?.[0]?.field).toBe("seed");
    expect(parsed.models[0].parameters?.[0]?.sourceUrl).toBe(SOURCE);
  });
});
