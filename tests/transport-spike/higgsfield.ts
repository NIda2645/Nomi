/**
 * Higgsfield 真机小样 —— **请求体由我们自己的种子/mapping 现场构建**，不是手写 JSON。
 *
 * 为什么这么写：手写一条 curl 只能证明「Higgsfield 能用」，证明不了「Nomi 接对了」。
 * 这里走 buildHttpRequest + HIGGSFIELD_VENDOR_SEED + HIGGSFIELD_MODELS，所以出网的
 * 字节就是装机后真实会发的字节；顺带把真实响应录下来给单测当夹具（不手写假响应）。
 *
 * 跑法（key 只从环境读，绝不落盘）：
 *   set -a; . ~/.nomi-secrets.env; set +a
 *   npx tsx tests/transport-spike/higgsfield.ts <case>
 * case: estimate-only | soul2 | cinema | dop-turbo
 *
 * 花钱纪律：每个 case 先打 /estimate 拿价，超过 USD_CAP 直接不提交。
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { buildHttpRequest, buildTemplateContext } from "../../electron/ai/requestPipeline";
import { HIGGSFIELD_VENDOR_SEED } from "../../electron/catalog/higgsfieldVendor";
import { HIGGSFIELD_MODELS } from "../../electron/catalog/higgsfieldModels";
import { CURATED_ASSET_INGESTION } from "../../electron/catalog/assetIngestionRegistry";

const USD_CAP = Number(process.env.HIGGSFIELD_USD_CAP || "1.0");
const KEY = process.env.HIGGSFIELD_API_KEY || "";
if (!KEY) throw new Error("HIGGSFIELD_API_KEY 未设置");
const OUT = `${__dirname}/../../docs/evidence/2026-09-17-higgsfield-contract/live/`;
mkdirSync(OUT, { recursive: true });

const redact = (s: string) => s.split(KEY).join("<HIGGSFIELD_KEY>");
const save = (name: string, value: unknown) =>
  writeFileSync(OUT + name, redact(JSON.stringify(value, null, 2)) + "\n");

function modelFor(modelKey: string) {
  const model = HIGGSFIELD_MODELS.find((m) => m.modelKey === modelKey);
  if (!model) throw new Error(`no seeded model ${modelKey}`);
  return model;
}

/** 用我们自己的种子 + mapping 造出真实出网请求。 */
function buildFromSeed(modelKey: string, prompt: string, params: Record<string, unknown>) {
  const model = modelFor(modelKey);
  const mapping = model.mappings[0];
  const context = buildTemplateContext({
    request: { prompt }, params, model: { modelKey }, modelKey, apiKey: KEY,
  });
  return {
    mapping,
    built: buildHttpRequest({
      baseUrl: HIGGSFIELD_VENDOR_SEED.baseUrl,
      authType: HIGGSFIELD_VENDOR_SEED.authType,
      authHeaderName: HIGGSFIELD_VENDOR_SEED.authHeader,
      authScheme: HIGGSFIELD_VENDOR_SEED.authScheme,
      apiKey: KEY,
      context,
      operation: mapping.create,
    }),
  };
}

async function estimate(path: string, body: unknown): Promise<number> {
  const res = await fetch(`${HIGGSFIELD_VENDOR_SEED.baseUrl}/estimate${path}`, {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { usd?: string; credits?: string };
  console.log(`  estimate ${path} → ${res.status} credits=${json.credits} usd=${json.usd}`);
  save(`estimate${path.replace(/\//g, "_")}.json`, json);
  return Number(json.usd || "0");
}

/** 走档案声明的自有上传通道（不经 KIE、不经图床），返回 public_url。 */
async function uploadViaOwnChannel(bytes: Buffer, contentType: string): Promise<string> {
  const ing = CURATED_ASSET_INGESTION.higgsfield;
  if (!ing || ing.strategy !== "upload-initiate-put") throw new Error("higgsfield 吞入声明不是 upload-initiate-put");
  const init = await fetch(ing.endpoint, {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: contentType }),
  });
  const payload = (await init.json()) as Record<string, unknown>;
  save("upload-init-shape.json", { keys: Object.keys(payload).sort(), content_type: payload.content_type, upload_headers: payload.upload_headers });
  const uploadUrl = String(payload[ing.uploadUrlPath]);
  const publicUrl = String(payload[ing.urlPath]);
  const headers = { "Content-Type": contentType, ...(payload[ing.uploadHeadersPath!] as Record<string, string>) };
  const put = await fetch(uploadUrl, { method: "PUT", headers, body: new Uint8Array(bytes) });
  if (!put.ok) throw new Error(`PUT ${put.status}`);
  console.log(`  uploaded via Higgsfield's own channel → ${publicUrl}`);
  return publicUrl;
}

// ⚠️ 用 built.url/headers/body，**不要用 built.preview**：preview 是给界面看的，
// 里面的凭据已被 collectRequestSecretValues 打码，照它发出去必然 401。
async function submitAndPoll(label: string, built: { url: string; headers: Record<string, string>; body: unknown }) {
  const started = Date.now();
  const res = await fetch(built.url, {
    method: "POST", headers: built.headers, body: JSON.stringify(built.body),
  });
  const created = (await res.json()) as Record<string, unknown>;
  save(`${label}-create.json`, created);
  console.log(`  create → ${res.status} ${JSON.stringify(created).slice(0, 160)}`);
  if (!res.ok) return;
  const id = String(created.request_id);
  const seen = new Set<string>();
  for (let i = 0; i < 120; i += 1) {
    const q = await fetch(`${HIGGSFIELD_VENDOR_SEED.baseUrl}/requests/${id}/status`, { headers: { Authorization: `Key ${KEY}` } });
    const body = (await q.json()) as Record<string, unknown>;
    const status = String(body.status);
    if (!seen.has(status)) { seen.add(status); console.log(`    [${((Date.now() - started) / 1000).toFixed(1)}s] ${status}`); }
    if (["completed", "failed", "nsfw", "canceled"].includes(status)) {
      save(`${label}-terminal.json`, body);
      console.log(`  DONE ${status} in ${((Date.now() - started) / 1000).toFixed(1)}s · statuses seen: ${[...seen].join(" → ")}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  console.log("  TIMEOUT");
}

const CASES: Record<string, () => Promise<void>> = {
  async soul2() {
    const { built, mapping } = buildFromSeed("higgsfield-ai/soul/v2/standard", "a quiet studio still life, soft north light, editorial", { aspect_ratio: "16:9", resolution: "720p", batch_size: 1 });
    save("soul2-outbound-body.json", built.body);
    console.log("  body built by our mapping:", JSON.stringify(built.body));
    console.log("  auth scheme on the wire:", built.headers.Authorization?.split(" ")[0]);
    const usd = await estimate(mapping.create.path!, built.body);
    if (usd > USD_CAP) return console.log(`  SKIP: $${usd} > cap $${USD_CAP}`);
    await submitAndPoll("soul2", built);
  },
  async cinema() {
    const { built, mapping } = buildFromSeed("higgsfield-ai/soul/cinema", "a lone figure crossing a brutalist hall, volumetric light", { aspect_ratio: "16:9", resolution: "1080p", batch_size: 1 });
    const usd = await estimate(mapping.create.path!, built.body);
    if (usd > USD_CAP) return console.log(`  SKIP: $${usd} > cap $${USD_CAP}`);
    await submitAndPoll("cinema", built);
  },
  async "dop-turbo"() {
    const png = readFileSync(process.env.HIGGSFIELD_REF_IMAGE!);
    const publicUrl = await uploadViaOwnChannel(png, "image/png");
    const { built, mapping } = buildFromSeed("higgsfield-ai/dop/turbo", "slow push in, the light shifts across the surface", { image_url: publicUrl });
    save("dop-turbo-outbound-body.json", built.body);
    console.log("  body built by our mapping:", JSON.stringify(built.body).slice(0, 220));
    const usd = await estimate(mapping.create.path!, built.body);
    if (usd > USD_CAP) return console.log(`  SKIP: $${usd} > cap $${USD_CAP}`);
    await submitAndPoll("dop-turbo", built);
  },
};

async function main() {
  const which = process.argv[2] || "";
  if (!CASES[which]) throw new Error(`case 必须是 ${Object.keys(CASES).join(" | ")}`);
  console.log(`== ${which} (cap $${USD_CAP}) ==`);
  await CASES[which]();
}

void main();
