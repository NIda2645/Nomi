# pi AgentSession compatibility probe (R0)

This is an isolated compatibility test, **not Nomi's production Agent**. No
product entry imports this package. R1 will move the verified adapters into
`electron/harness`, remove this experimental implementation, and replace the
old Agent loop at one tested cutover boundary.

The probe pins all pi packages to `0.84.3`. It requires Node `>=22.19.0`; the
Electron check uses the repository's installed Electron. It uses synthetic
credentials and an ephemeral localhost HTTP server, never a paid provider or
the user's project/settings directories.

## Run

From this directory:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run typecheck
node scripts/run-electron-probe.mjs --dev
```

From the repository root, build a separate unsigned macOS arm64 application:

```sh
pnpm exec electron-builder --projectDir experiments/pi-agent-runtime --config electron-builder.cjs --mac dir --arm64 --publish never
node experiments/pi-agent-runtime/scripts/run-electron-probe.mjs --packaged
```

Rebuild the experiment and the ASAR after any source change. Development-mode
success is not evidence that the packaged program contains the same code.
The packaged probe rejects dependency resolution outside its own application;
it cannot borrow the development tree's `node_modules`.

## What is exercised

| Boundary | Evidence |
| --- | --- |
| Provider transport | Real SDK HTTP/SSE for Chat Completions, Responses, and Anthropic Messages; exact model, endpoint, literal headers/credentials, no-auth and output limits |
| Controlled runtime | Empty resource loader, explicit Nomi-only tool list, no SDK default shell/file tools, no network model discovery |
| Tools | Original arguments validated by the existing Zod schema, including preprocessing/transforms; serialized execution; one host call; denial and cancellation |
| Attachments | Actual image bytes and native PDF payloads for Anthropic/Responses, including a restored session; unsupported compatible-PDF input is rejected |
| Work context | Full tool pairs, usage, compaction and branch leaf round-trip through the SDK public loader; malformed snapshots fail before loading |
| Lifecycle | Streaming, tool waits, prompt startup, manual compaction and branch-summary cancellation; subsequent work cannot escape a completed stop |
| Electron | CommonJS host loads ESM adapters; tool turn, full snapshot restoration and another turn execute in both development and ASAR |

Only the remote model response is simulated. `AgentSession`, the model
adapters, protocol parsing, tool loop, session manager and compaction all run
the installed SDK.

## Boundaries that remain Nomi's responsibility

- A tool host must honor its `AbortSignal` and validate the live project/target
  before a side effect. Stopping the SDK cannot undo an already accepted remote
  generation or a completed edit.
- A work-context snapshot is not an approval receipt, production ledger, or
  project document. Restoration must not replay tools or resurrect permission.
- The probe's model costs are zero because its endpoint is synthetic. They are
  not prices for real models. The product's catalog and budget remain separate.
- Compaction is opt-in in this probe and explicitly tested. The full history
  retains PDF bytes; the summarized working context does not promise to resend
  every historical attachment.
- These results do not prove the six Nomi product entrances, cross-space Agent
  continuity, real-provider quality, Windows/Linux packaging, or UI usability.

See [R0 implementation card](../../docs/plan/2026-08-26-pi-r0-compatibility.md)
for the stage status and verification record.
