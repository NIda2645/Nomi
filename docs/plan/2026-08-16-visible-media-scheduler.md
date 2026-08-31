# Visible media scheduler

## Problem

Canvas node virtualization is working, but the independent media scheduler treats the first
viewport intersection as permanent. Media that has since left the viewport can keep queued or
active image/video slots, while media that is currently visible waits behind it under an opaque
loading layer. The eight-second slot watchdog only frees concurrency; it does not terminate the
component state, so the underlying media can remain `opacity-0` indefinitely. Images also pass
through `NomiImage`'s native lazy-loading decision after the scheduler has admitted them.

## Scope

- Make media eligibility track the real browser viewport continuously.
- Cancel queued work and release active slots when media leaves that viewport.
- Reprioritize an existing queued request when its node becomes selected/focused.
- Model `idle -> queued -> loading -> ready | error | timeout` explicitly.
- Turn the slot watchdog into a visible, retryable timeout instead of a silent release.
- Load scheduler-admitted images eagerly while keeping asynchronous decoding.
- Preserve the last ready media while a replacement is queued/decoded; otherwise keep the
  existing opaque loading placeholder.
- Strengthen durable unit and real-user performance checks around visible media settlement.

## Non-scope

- Do not change canvas node virtualization or its 400px render buffer.
- Do not change the `>80 nodes && zoom <0.55` lightweight node LOD policy.
- Do not increase image/video concurrency limits (image 4, video 1).
- Do not change generation, persistence, video transcoding, or media URL resolution.
- Do not introduce a new visual language; timeout/error feedback reuses existing Nomi tokens,
  loading surfaces, translations, and action components.

## Interaction contract

1. A rendered node outside the clipped browser viewport does not consume a media slot.
2. Entering the viewport queues its media after the canvas shell paint.
3. Visible priority media is ordered before visible normal media, including requests already
   waiting in the queue.
4. Leaving the viewport cancels queued work or aborts the active element and releases its slot.
5. A decoded image or current video frame becomes visible and releases its slot.
6. Failure or an eight-second timeout removes the transparent loading media, shows an opaque
   recoverable state, releases the slot, and offers a retry.
7. Replacing a source keeps the previous ready frame visible until the new source is ready.

## Rollback

Revert the scheduler/component/test commit. No persisted schema, project data, IPC contract, or
generated asset is changed, so rollback needs no migration.

## Acceptance criteria

- Unit tests prove continuous visibility, offscreen cancellation/release, queued reprioritization,
  independent concurrency lanes, terminal timeout, and decoded-frame readiness.
- Component behavior cannot leave timed-out or failed media under `opacity-0`.
- Scheduler-admitted images use eager browser loading.
- Existing focused/selected priority behavior remains intact and becomes dynamic while queued.
- Targeted tests, lint, typecheck, full `pnpm gates`, and production build pass.
- Real Electron journeys cover initial visible load, pan away/back plus reload, and timeout/error;
  screenshots are captured and visually inspected.
