# Stop covers pending input admission

> 状态：已实现，验证中。

The user presses Stop to end this conversation's work. Inputs already waiting for catalog, configuration, readiness or skill preparation must not restart it afterwards.

Scope: renderer existing admission token; IPC configuration wait; workspace readiness; host input/skill/unlock preparation and pi acceptance. Keep pi 0.85.1, its queues/abort, existing session identity, current T5/T6 authority fixes and normal initialization/model-reopen waiting. No new reducer or execution queue.

Prior art: installed pi-agent-core 0.85.1 `harness/context.d.ts:1–6` exposes `withCancel`, `withAbortSignal`, `awaitWithContext`; chord `dist/context/index.js:54–98` combines native AbortSignals and cancels only a waiter. pi `harness/runtime/lane.js:313` accept and `:1086` steer/followUp already take Context. Reuse these public facilities. Do not race-cancel the actual acceptance acknowledgement: once pi commits it, pi owns recovery.

Workspace owns the main pre-admission cancellation scope. IPC captures its signal before existing configuration serialization; workspace execute inherits it across awaitReady; host combines it with its own scope for native direct callers. Stop cancels synchronously before awaiting and creates a new scope for subsequent inputs. Close cancels without admitting further work. Renderer owns only unsent input through existing admissionId and issuing address.

Evidence before implementation: `/tmp/nomi-recovery-stop-independent.log` (live hook fails), `/tmp/nomi-stop-preparation-native-review.log` (two real pi/local HTTP failures). Repository tests additionally exercise configuring and waiting IPC inputs, same-session model readiness, Stop then new input, stale visible Stop/new token safety.

Rollback: revert only the F12 incremental commit after the temporary T5/T6 baseline. Acceptance: original three failures become green; cancelled inputs preserve draft; new inputs after Stop succeed; existing IPC/client/workspace/native suites remain green. Tests run under with-gates-lock. Real Electron/paid model are outside this isolated implementation proof.
