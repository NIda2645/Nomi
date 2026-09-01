# Credential-bearing connection config → encrypted at rest (P2 class fix)

**Date:** 2026-09-01
**Branch:** feat/credential-config-encryption-20260901
**Base:** origin/main @ 10baed5a (includes #282 per-connection proxy 6a0c3ca2, #276/#278)

## Problem (class root)

`apiKey` lands encrypted through safeStorage (`ApiKeyRecord.enc = "safeStorage"`), and
`customConfig` was already moved to the same encrypted tier (catalog v9). But two other
**credential-bearing** vendor-config fields still land as plaintext in `model-catalog.json`:

- `Vendor.network.proxyUrl` (`electron/catalog/types.ts:246`) — can carry `user:pass@` userinfo.
- `Vendor.meta.extraHeaders` (string→string map) — can carry `Authorization` / bearer values.

Logs are already redacted (`redactNetworkMessage` / `safeNetworkUrl`), but **at rest** these are
naked. The #282 contract explicitly deferred this
(`2026-09-01-provider-proxy-per-connection.root-cause.json` residual_risks). This task closes it.

Class root: "credential-bearing connection config" had **no single encrypted boundary** — each
field decided its own storage. apiKey/customConfig were encrypted; proxyUrl/extraHeaders were not.

## Approach (mirror the existing customConfig mechanism — P1 no parallel pipeline)

The v9 `customConfig` tier is the proven mechanism: values stored as `EncryptedSecretValue`
(`{ value, enc: "safeStorage" }`) inside the vendor's `ApiKeyRecord`, decrypted only at explicit
read, with a deferred legacy-plaintext migration. proxyUrl + extraHeaders ride the **same tier**.

The mechanism is credential-agnostic (P4): it stores/decrypts a "credential payload", not
"a proxy" or "a header".

### Storage (single boundary)

Extend `ApiKeyRecord` with `networkConfig?: { proxyUrl?: EncryptedSecretValue; extraHeaders?: Record<string, EncryptedSecretValue> }`
— same record, same deletion boundary as apiKey/customConfig. New module
`electron/catalog/networkConfigStore.ts` owns encrypt/decrypt/legacy-merge (parallel to
`customConfigStore.ts`), reusing `encryptCustomSecretValue`/`decryptCustomSecretValue` from
`secrets.ts` (no second crypto path).

### Write boundary

`applyVendorUpsert` (the single vendor-write choke point in `catalogStore.ts`) encrypts incoming
`vendor.network.proxyUrl` + `vendor.meta.extraHeaders` into `ApiKeyRecord.networkConfig` and strips
the plaintext off the persisted vendor (mirror `applyPlainCustomConfigWrite`). Fail-closed when
safeStorage unavailable (mirror customConfig).

### Read boundary (single choke point)

`readCatalog()` already decrypts the apiKey on every read (for `hasApiKey`). At that same choke
point, rehydrate decrypted `network.proxyUrl` + `meta.extraHeaders` back onto the **internal**
Vendor, falling back to legacy plaintext when no encrypted value exists. All outbound consumers
(`providerNetwork.providerDispatcher`, `catalogStore.extractVendorExtraHeaders`,
`existingConnection`) read the internal vendor synchronously — unchanged. `publicVendor()` strips
both fields from every renderer/export DTO (extends the existing `customConfig` strip).

### Migration

Bump catalog `v11 → v12`. v12 is structural: forward migration advances the version but defers
secret encryption until the next explicit vendor write (mirror v8→v9). Legacy plaintext is read
on load and idempotently upgraded on write. Repeated upgrade is a no-op (idempotent).

### Structural prevention (P2 heart — "this class never recurs")

`electron/catalog/credentialConfigFields.ts` declares `VENDOR_CONFIG_FIELD_CLASSIFICATION` — every
`Vendor` field marked `credential-bearing` (routes through encrypted tier) or `non-credential`.
A guard test (`credentialConfigFields.test.ts`) enumerates the actual `Vendor` type keys and
asserts each is classified; a new credential field left unregistered → red. This is the
type-level+test guard that makes the class closed.

## Scope / not-touched

- Touch: catalog secret/store/types/migration, providerNetwork read, providerAdapter write sites'
  read-back, i18n copy (proxy + custom-header hints say "encrypted"), the new store + guard modules.
- **Not** touched: the crypto primitive (`safeStorage`), the app-global proxy, apiKey semantics,
  React Flow canvas, any UI layout (copy-only).

## Verification

- `pnpm run gates` full (sentinel) + `check:root-cause-contracts` (self-authored recurring v3
  contract) + `check:i18n` + walkthrough screenshot of the onboarding form showing the encrypted
  copy on-screen.
- New tests: migration (legacy plaintext → upgrade → read-back equal; idempotent re-upgrade),
  encrypt/decrypt round-trip, fail-closed when safeStorage unavailable, DTO never carries plaintext,
  field-classification guard.

## Rollback

Revert the branch; v12 catalogs remain readable by v12 code. Legacy plaintext catalogs are
untouched until an explicit write, so downgrade risk is nil (write refuses on higher on-disk
version, existing guard).
