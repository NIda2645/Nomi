/**
 * 声明卡上 §5 新增的那几格（docs/plan/2026-09-18-agent-model-onboarding.md §5）。
 *
 * ── 为什么这些字段必须在卡上 ────────────────────────────────────────────────────────
 * 它们**已经在 Vendor 上存在**，只是卡上缺——于是「Agent 交一张卡就能接进来」对这几类供应商
 * 结构性不成立：
 *   · `provider.authScheme`：Higgsfield 的 `Authorization: Key id:secret` 既不是 Bearer 也不是
 *     换个头名字，而是同一个头里换一个方案词（`catalog/types.ts` Vendor.authScheme）。
 *   · `assetIngestion`：参考图/视频怎么进这家。**必填，且 `none` 必须显式**——「没声明」和
 *     「这家不收本地素材」是两件事，把前者当后者处理就是静默兜底（任务书附二）。
 *     声明面**不含** `comfyui-upload` / `anon-chain`：前者是本地 ComfyUI 的专属通道，后者是
 *     跨供应商互借的匿名图床（附二要删的那条）。
 *   · `selfCheck`：`GET /models` 不是每家的权威源——Higgsfield 两把 key 返回逐字节相同的目录、
 *     且不列 DoP（`higgsfieldVendor.ts` 实测）。本仓的 curated 种子**早就**能声明
 *     `livenessProbe {request, successPath, source}`，只有卡上没有。抄的是 LiteLLM「把探针差异
 *     外化成声明」，不抄它的付费探针（免费是硬约束，09-12 拍板）。
 *   · `omitted[]`：文档写了但这张卡不声明的字段 + 理由。让 Agent 的取舍**可审计**，不参与执行。
 *   · `parameters[].sourceUrl`：每个数字能追到出处（mode 级 `sourceUrls` 已有，参数级补齐）。
 *
 * 这里只放 zod 形状；「这些 URL 必须与绑定同源」那条判据住 validator.ts，与已有的同源判据同一处
 * （不造第二个同源分类器）。
 */
import { z } from "zod";
import { ASSET_MEDIA_KINDS } from "../catalog/types";

const mediaKinds = z.array(z.enum(ASSET_MEDIA_KINDS)).min(1).max(8);
const uploadAuth = z.enum(["bearer", "key"]);
const dotPath = z.string().min(1).max(512);
const endpoint = z.string().url().max(2_048);
const sourceUrl = z.string().url().max(2_048);

const ingestionCommon = {
  accepts: mediaKinds.optional().describe("Which media kinds this channel accepts: image, video or audio."),
  ttlSeconds: z.number().int().positive().max(31_536_000).optional().describe("How long the uploaded file stays reachable, in seconds."),
  sourceUrl: sourceUrl.describe("Exact documentation page URL this upload channel was read from."),
};

export const declaredAssetIngestionSchema = z.discriminatedUnion("strategy", [
  z.object({
    strategy: z.literal("none"),
    ...ingestionCommon,
  }).strict().describe("This provider has no upload channel: local files cannot be sent to it. Declare this explicitly; leaving assetIngestion out is a rejected card, not a fallback."),
  z.object({ strategy: z.literal("inline-base64"), ...ingestionCommon }).strict(),
  z.object({
    strategy: z.literal("upload-url"),
    endpoint: endpoint.describe("Full URL of the upload endpoint."),
    method: z.string().min(1).max(12).optional().describe("HTTP method; POST when omitted."),
    base64Field: z.string().min(1).max(128).describe("Body field that receives the base64 payload."),
    dataUrlPrefix: z.boolean().optional().describe("Whether the value carries a data: URI prefix; true when omitted."),
    uploadPathField: z.string().min(1).max(128).optional().describe("Body field naming the target folder, when the provider has one."),
    uploadPath: z.string().min(1).max(512).optional().describe("Value for uploadPathField."),
    fileNameField: z.string().min(1).max(128).optional().describe("Body field that receives the file name."),
    urlPath: dotPath.describe("Dot path to the public URL in the response."),
    authType: uploadAuth.optional().describe("How the saved key rides this upload request; bearer when omitted."),
    ...ingestionCommon,
  }).strict(),
  z.object({
    strategy: z.literal("upload-multipart"),
    endpoint: endpoint.describe("Full URL of the multipart upload endpoint."),
    urlPath: dotPath.optional().describe("Dot path to the public URL in the response."),
    responseIsPlainTextUrl: z.boolean().optional().describe("True when the whole response body is the URL rather than JSON."),
    fileField: z.string().min(1).max(128).optional().describe("Multipart field carrying the bytes; file when omitted."),
    extraFields: z.record(z.string(), z.string()).optional().describe("Fixed text fields sent alongside the file."),
    authType: uploadAuth.optional().describe("How the saved key rides this upload request; bearer when omitted."),
    ...ingestionCommon,
  }).strict(),
  z.object({
    strategy: z.literal("upload-stream"),
    endpoint: endpoint.describe("Full URL of the streaming upload endpoint."),
    uploadPathField: z.string().min(1).max(128).optional().describe("Field naming the target folder."),
    uploadPath: z.string().min(1).max(512).optional().describe("Value for uploadPathField."),
    fileNameField: z.string().min(1).max(128).optional().describe("Field that receives the file name."),
    urlPath: dotPath.describe("Dot path to the public URL in the response."),
    authType: uploadAuth.optional().describe("How the saved key rides this upload request; bearer when omitted."),
    ...ingestionCommon,
  }).strict(),
  z.object({
    strategy: z.literal("upload-presigned"),
    endpoint: endpoint.describe("Full URL of the initiate endpoint. Only this request carries the key."),
    uploadUrlPath: dotPath.describe("Dot path to the upload URL in the initiate response."),
    uriPath: dotPath.describe("Dot path to the provider-side URI in the initiate response."),
    fieldsPath: dotPath.optional().describe("Dot path to the multipart fields object; fields when omitted."),
    initFields: z.record(z.string(), z.string()).optional().describe("Fixed fields on the initiate request."),
    initHeaders: z.record(z.string(), z.string()).optional().describe("Fixed headers on the initiate request."),
    filenameField: z.string().min(1).max(128).optional().describe("Initiate field that receives the file name."),
    typeField: z.string().min(1).max(128).optional().describe("Initiate field that receives the media type."),
    uploadFileField: z.string().min(1).max(128).optional().describe("Multipart field carrying the bytes on the upload request."),
    ...ingestionCommon,
  }).strict(),
  z.object({
    strategy: z.literal("upload-initiate-put"),
    endpoint: endpoint.describe("Full URL of the initiate endpoint. Only this request carries the key."),
    initFileNameField: z.string().min(1).max(128).optional().describe("Initiate field that receives the file name."),
    initContentTypeField: z.string().min(1).max(128).optional().describe("Initiate field that receives the content type."),
    uploadUrlPath: dotPath.describe("Dot path to the signed PUT URL in the initiate response."),
    uploadHeadersPath: dotPath.optional().describe("Dot path to headers the PUT must echo, when the signature covers them."),
    urlPath: dotPath.describe("Dot path to the provider-side URL in the initiate response."),
    authType: uploadAuth.optional().describe("How the saved key rides the initiate request; bearer when omitted."),
    ...ingestionCommon,
  }).strict(),
  z.object({
    strategy: z.literal("upload-initiate-multipart"),
    endpoint: endpoint.describe("Full URL of the initiate endpoint. Only this request carries the key."),
    uploadUrlPath: dotPath.describe("Dot path to the upload URL in the initiate response."),
    fieldsPath: dotPath.describe("Dot path to the multipart fields object in the initiate response."),
    uriPath: dotPath.describe("Dot path to the provider-side URI in the initiate response."),
    fileField: z.string().min(1).max(128).optional().describe("Multipart field carrying the bytes."),
    initFileNameField: z.string().min(1).max(128).optional().describe("Initiate field that receives the file name."),
    initTypeField: z.string().min(1).max(128).optional().describe("Initiate field that receives the media type."),
    initType: z.string().min(1).max(128).optional().describe("Fixed value for initTypeField."),
    authType: uploadAuth.optional().describe("How the saved key rides the initiate request; bearer when omitted."),
    ...ingestionCommon,
  }).strict(),
]);

export type DeclaredAssetIngestion = z.infer<typeof declaredAssetIngestionSchema>;

/**
 * 声明面允许的吞入策略，**从 schema 自己派生**（Ponytail 2026-09-18：手抄一份字面量 = 第二份真相源，
 * 加一条策略时它会安静地落后）。`catalog/types.ts` 的 AssetIngestion 减去两条不可声明的
 * （`comfyui-upload` 本地专属、`anon-chain` 跨供应商互借的匿名图床）。
 */
export const DECLARABLE_INGESTION_STRATEGIES: readonly DeclaredAssetIngestion["strategy"][] = Object.freeze(
  declaredAssetIngestionSchema.options.map((option) => option.shape.strategy.value),
);

/**
 * 免费自检的形状。**探针不许是生成端点**（那会把「免费」变成「每接一次模型扣一次钱」）——
 * 判据在 validator.ts：探针 path 不得等于任何一条 mode 的 `create.path`。
 */
export const declaredSelfCheckSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("model-list"),
  }).strict().describe("Default: Nomi calls the provider's own model list (GET /models) to check the address and the key."),
  z.object({
    kind: z.literal("liveness-probe"),
    request: z.object({
      method: z.enum(["GET", "POST"]).describe("HTTP method of the free probe."),
      path: z.string().min(1).max(2_048).describe("Probe path or same-origin absolute URL. It must not be a generation endpoint."),
      headers: z.record(z.string(), z.string()).optional().describe("Fixed headers for the probe."),
      query: z.record(z.string(), z.string()).optional().describe("Fixed query parameters for the probe."),
      body: z.unknown().optional().describe("Fixed JSON body for the probe, when it is a POST."),
    }).strict().describe("The free request that proves the address and the key work."),
    successPath: dotPath.describe("Dot path to a field that exists in a healthy response."),
    sourceUrl: sourceUrl.describe("Exact documentation page URL this probe was read from."),
  }).strict().describe("For providers whose model list is not authoritative: a free, non-billable liveness request they document themselves."),
]);

export type DeclaredSelfCheck = z.infer<typeof declaredSelfCheckSchema>;

/** 文档写了但这张卡刻意不声明的字段 + 理由。不参与执行，只让取舍可审计。 */
export const declaredOmissionsSchema = z.array(
  z.object({
    field: z.string().min(1).max(256).describe("The documented field this card leaves out."),
    reason: z.string().min(1).max(1_000).describe("Why it is left out."),
    sourceUrl: sourceUrl.describe("Documentation page that documents the field."),
  }).strict(),
).max(64);

/** 指回供应商自己的 OpenAPI 文档（证据的机器可读形式）。我们指向它，不复制它（§2.3）。 */
export const declaredOpenApiSchema = z.object({
  url: sourceUrl.describe("URL of the provider's own OpenAPI document."),
  operationIds: z.record(z.string(), z.string().min(1).max(256)).optional()
    .describe("modeKey -> operationId in that document, when the provider publishes one."),
}).strict();
