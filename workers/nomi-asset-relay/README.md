# Nomi asset relay

This Worker is the optional Nomi-owned first upload channel. It keeps R2 credentials server-side, accepts authenticated multipart uploads at `POST /v1/assets`, serves short-lived model-readable URLs at `GET /v1/assets/:key`, and removes expired objects from its hourly scheduled cleanup.

## Deploy

Create the bucket once, set a real `PUBLIC_BASE_URL` in `wrangler.toml` or the Cloudflare dashboard, then run:

```sh
wrangler r2 bucket create nomi-assets
wrangler secret put RELAY_TOKEN
wrangler deploy
```

After deployment, launch Nomi with:

```sh
NOMI_ASSET_RELAY_URL=https://<your-worker-or-custom-domain>/v1/assets \
NOMI_ASSET_RELAY_TOKEN=<the-same-secret> \
pnpm dev
```

The token is read only by Electron main-process code. Never put it in renderer code, a public `.env`, or a provider request body. `r2.dev` is intended for development; use a custom domain or Worker route for production.

The repository cannot run `wrangler deploy` without the target Cloudflare account. Before deployment, `wrangler whoami` must succeed and the placeholder public base URL must be replaced.
