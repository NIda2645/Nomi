const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
/* global Headers, Response, URL, File, crypto */

const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;
const ALLOWED_MEDIA = new Set(["image", "video", "audio"]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function bearer(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

function authorized(request, env) {
  return Boolean(env.RELAY_TOKEN) && bearer(request) === env.RELAY_TOKEN;
}

function maxUploadBytes(env) {
  const value = Number(env.MAX_UPLOAD_BYTES || DEFAULT_MAX_BYTES);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_MAX_BYTES;
}

function publicBaseUrl(request, env) {
  return String(env.PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/+$/, "");
}

function safeFileName(name) {
  const value = String(name || "asset").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return value.slice(-120) || "asset";
}

function assetKey(fileName) {
  return `assets/${Date.now()}-${crypto.randomUUID()}-${safeFileName(fileName)}`;
}

function assetPath(request) {
  const url = new URL(request.url);
  const prefix = "/v1/assets/";
  if (!url.pathname.startsWith(prefix)) return null;
  const key = decodeURIComponent(url.pathname.slice(prefix.length));
  return key.startsWith("assets/") ? key : null;
}

async function upload(request, env) {
  if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > maxUploadBytes(env)) return json({ error: "file_too_large" }, 413);
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "multipart_required" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "file_required" }, 400);
  if (!ALLOWED_MEDIA.has(String(file.type || "").split("/", 1)[0])) return json({ error: "media_type_not_allowed" }, 415);
  if (file.size <= 0 || file.size > maxUploadBytes(env)) return json({ error: "file_too_large" }, 413);
  const ttlSeconds = Math.max(15 * 60, Number(env.ASSET_TTL_SECONDS || DEFAULT_TTL_SECONDS));
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const key = assetKey(file.name);
  await env.ASSETS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream", cacheControl: "private, max-age=300" },
    customMetadata: { expiresAt, originalName: safeFileName(file.name) },
  });
  return json({ url: `${publicBaseUrl(request, env)}/v1/assets/${encodeURIComponent(key)}`, expiresAt }, 201);
}

async function read(request, env) {
  const key = assetPath(request);
  if (!key) return json({ error: "not_found" }, 404);
  const object = await env.ASSETS.get(key);
  if (!object) return json({ error: "not_found" }, 404);
  const expiresAt = object.customMetadata?.expiresAt;
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
    await env.ASSETS.delete(key);
    return json({ error: "expired" }, 404);
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("X-Nomi-Asset-Expires-At", expiresAt || "");
  return new Response(object.body, { headers });
}

export async function cleanup(env) {
  let cursor;
  let deleted = 0;
  do {
    const page = await env.ASSETS.list({ prefix: "assets/", cursor });
    for (const object of page.objects || []) {
      const expiresAt = object.customMetadata?.expiresAt;
      if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
        await env.ASSETS.delete(object.key);
        deleted += 1;
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/v1/assets") return upload(request, env);
    if (request.method === "GET" && url.pathname.startsWith("/v1/assets/")) return read(request, env);
    return json({ error: "not_found" }, 404);
  },
  async scheduled(_event, env) {
    await cleanup(env);
  },
};
