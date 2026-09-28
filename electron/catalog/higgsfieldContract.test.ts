/**
 * Higgsfield 接入契约测试。
 *
 * 断言都打在**录下来的真实响应**上（fixtures/higgsfield/，2026-09-17 真机跑出来的），
 * 不用手写假响应——假响应只会复述我们「以为」的形状，证明不了我们读对了供应商。
 * 这几条夹具恰好抓到两个「以为」是错的地方：状态词 in_progress，和 images[].url 是
 * 裸字符串而不是 apimart 那种数组。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildHttpRequest, buildTemplateContext } from "../ai/requestPipeline";
import { resolveTaskStatus } from "../tasks/responseParsing";
import { CURATED_ASSET_INGESTION } from "./assetIngestionRegistry";
import { HIGGSFIELD_MODELS } from "./higgsfieldModels";
import { HIGGSFIELD_STATUS_MAPPING, HIGGSFIELD_VENDOR_SEED } from "./higgsfieldVendor";

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`./fixtures/higgsfield/${name}`, import.meta.url), "utf8"));

const modelFor = (modelKey: string) => {
  const model = HIGGSFIELD_MODELS.find((m) => m.modelKey === modelKey);
  if (!model) throw new Error(`no seeded model ${modelKey}`);
  return model;
};

const buildCreate = (modelKey: string, prompt: string, params: Record<string, unknown>) =>
  buildHttpRequest({
    baseUrl: HIGGSFIELD_VENDOR_SEED.baseUrl,
    authType: HIGGSFIELD_VENDOR_SEED.authType,
    authHeaderName: HIGGSFIELD_VENDOR_SEED.authHeader,
    authScheme: HIGGSFIELD_VENDOR_SEED.authScheme,
    apiKey: "id123:secret456",
    context: buildTemplateContext({ request: { prompt }, params, model: { modelKey }, modelKey, apiKey: "id123:secret456" }),
    operation: modelFor(modelKey).mappings[0].create,
  });

describe("Higgsfield 鉴权", () => {
  it("方案词是 Key，不是 Bearer —— 换成 Bearer 供应商会回 401", () => {
    const built = buildCreate("higgsfield-ai/soul/v2/standard", "x", {});
    expect(built.headers.Authorization).toBe("Key id123:secret456");
  });
});

describe("Higgsfield 状态词映射", () => {
  const resolve = (status: string) =>
    resolveTaskStatus({ status }, { status: "status" }, HIGGSFIELD_STATUS_MAPPING, []);

  // 我们自己只声明了一个词。这条**对突变敏感**：把 nsfw 从表里删掉，它立刻红。
  it("nsfw 由我们这张表认出来，归失败态（有退款、没有产物）", () => {
    expect(HIGGSFIELD_STATUS_MAPPING.failed).toContain("nsfw");
    expect(resolve("nsfw").status).toBe("failed");
    expect(resolve("nsfw").unrecognizedStatus).toBeFalsy();
  });

  it("删掉本表后 nsfw 就不再被认出——证明上一条测的是本表，不是通用词表", () => {
    const withoutOurTable = resolveTaskStatus({ status: "nsfw" }, { status: "status" }, undefined, []);
    // 通用词表不认识 nsfw：于是走「乐观继续轮询 + 带出原始动词」那条路。
    expect(withoutOurTable.status).toBe("queued");
    expect(withoutOurTable.unrecognizedStatus).toBe("nsfw");
  });

  // 另外五个词**故意不进本表**（通用词表已经认得，再抄一份就是会漂的并行映射）。
  // 这组断言不传 statusMapping，所以它守的是「通用词表确实覆盖 Higgsfield 的动词」：
  // 上游哪天改了词表，这里立刻红，我们才知道要不要自己声明。
  const bySharedVocabulary: [string, string][] = [
    ["queued", "queued"],
    ["in_progress", "running"],
    ["completed", "succeeded"],
    ["failed", "failed"],
    ["canceled", "failed"],
  ];
  for (const [raw, expected] of bySharedVocabulary) {
    it(`${raw} 由通用词表认出 → ${expected}（故不进本表）`, () => {
      const resolved = resolveTaskStatus({ status: raw }, { status: "status" }, undefined, []);
      expect(resolved.status).toBe(expected);
      expect(resolved.unrecognizedStatus).toBeFalsy();
      // 只看表的**值**（键名本身就叫 failed，序列化整张表会误命中）。
      expect(Object.values(HIGGSFIELD_STATUS_MAPPING).flat()).not.toContain(raw);
    });
  }

  it("in_progress 出现在真实轮询里（文档没列它），通用词表认得", () => {
    const live = fixture("in-progress.json");
    expect(live.status).toBe("in_progress");
    expect(resolveTaskStatus(live, { status: "status" }, HIGGSFIELD_STATUS_MAPPING, []).status).toBe("running");
  });
});

describe("Higgsfield 真实响应的读取路径", () => {
  it("从录下来的终态里按档案声明的路径取到产物 URL", () => {
    const terminal = fixture("soul2-terminal.json");
    const mapping = modelFor("higgsfield-ai/soul/v2/standard").mappings[0];
    const path = String(mapping.query!.response_mapping!.image_url);
    // images.0.url —— 裸字符串，不是 apimart 的 url 数组。写成 images.0.url.0 会取空。
    expect(path).toBe("images.0.url");
    const value = path.split(".").reduce<unknown>((acc: unknown, key: string) => (acc as Record<string, unknown>)?.[key], terminal);
    expect(String(value)).toMatch(/^https:\/\/.+\.png$/);
  });

  it("DoP 的产物在 video.url（单数对象），不是 videos[] —— 写成数组会取空", () => {
    const terminal = fixture("dop-terminal.json");
    const mapping = modelFor("higgsfield-ai/dop/turbo").mappings[0];
    const path = String(mapping.query!.response_mapping!.video_url);
    expect(path).toBe("video.url");
    const value = path.split(".").reduce<unknown>((acc: unknown, key: string) => (acc as Record<string, unknown>)?.[key], terminal);
    expect(String(value)).toMatch(/^https:\/\/.+\.mp4$/);
    // 图片那条是数组、视频这条是对象：两者**不对称**，所以不能照着图片抄一份。
    expect(Array.isArray((terminal as { video?: unknown }).video)).toBe(false);
  });

  it("创建响应里的 request_id 会被存进 providerMeta.task_id 供轮询拼路径", () => {
    const created = fixture("soul2-create.json");
    const mapping = modelFor("higgsfield-ai/soul/v2/standard").mappings[0];
    expect(mapping.create.provider_meta_mapping).toEqual({ task_id: "request_id" });
    expect(String(created.request_id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(mapping.query!.path).toContain("{{providerMeta.task_id}}");
  });
});

describe("Higgsfield 请求体由档案参数派生", () => {
  it("没填的参数整键不出现，走供应商自己的默认值（我们不复制一份默认值）", () => {
    const built = buildCreate("higgsfield-ai/soul/v2/standard", "a still life", { aspect_ratio: "16:9" });
    expect(built.body).toEqual({ prompt: "a still life", aspect_ratio: "16:9" });
    expect(Object.keys(built.body as object)).not.toContain("seed");
  });

  it("batch_size 保持数字：校验器只认字面量 1 或 4，发成字符串会 422", () => {
    const built = buildCreate("higgsfield-ai/soul/v2/standard", "x", { batch_size: 4 });
    expect((built.body as { batch_size: unknown }).batch_size).toBe(4);
  });

  it("DoP 的首尾帧走 image_url / end_image_url 两个键（不是数组）", () => {
    const built = buildCreate("higgsfield-ai/dop/turbo", "push in", {
      image_url: "https://example.invalid/a.png",
      end_image_url: "https://example.invalid/b.png",
    });
    expect(built.body).toMatchObject({
      image_url: "https://example.invalid/a.png",
      end_image_url: "https://example.invalid/b.png",
    });
  });
});

describe("Higgsfield 自有上传通道", () => {
  const ingestion = CURATED_ASSET_INGESTION.higgsfield;

  it("声明的是自有两步上传，端点在 higgsfield 自己的域下（不经 KIE、不经图床）", () => {
    expect(ingestion.strategy).toBe("upload-initiate-put");
    expect(ingestion).toMatchObject({ endpoint: expect.stringContaining("api.higgsfield.ai") });
  });

  it("鉴权用 Key 方案（authType:'key'），与供应商种子的方案词一致", () => {
    expect((ingestion as { authType?: string }).authType).toBe("key");
  });

  it("声明了 uploadHeadersPath：预签名 URL 把 x-amz-tagging 算进签名，漏了就 403", () => {
    const path = (ingestion as { uploadHeadersPath?: string }).uploadHeadersPath;
    expect(path).toBe("upload_headers");
    // 录下来的真实初始化响应里，那个对象确实带着被签名的那个头。
    const live = fixture("upload-init-shape.json");
    expect(live.upload_headers).toMatchObject({ "x-amz-tagging": expect.any(String) });
  });

  it("有效期按对象保留 7 天算，不是文档写的 1 小时（那是上传窗口）", () => {
    expect((ingestion as { ttlSeconds?: number }).ttlSeconds).toBe(7 * 24 * 60 * 60);
  });
});

describe("只接旗舰，不接转售", () => {
  it("种子里只有 Higgsfield 自研的模型", () => {
    for (const model of HIGGSFIELD_MODELS) {
      expect(model.modelKey.startsWith("higgsfield-ai/")).toBe(true);
    }
  });

  it("Kling / Seedance / Wan / MiniMax 这些转售壳一个都没进来", () => {
    const keys = HIGGSFIELD_MODELS.map((m) => m.modelKey).join(" ");
    for (const resold of ["kling", "seedance", "wan", "minimax", "recraft", "ideogram", "pixverse"]) {
      expect(keys).not.toContain(resold);
    }
  });
});
