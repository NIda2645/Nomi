# Clip node media usability fixes

## Problem

The clip node currently exposes four related user-facing failures:

1. The media lane reaches into the ruler, so clip borders and thumbnails cover time labels.
2. The initial 30-second tick is centered on the viewport edge and the node is too narrow, making the final label clipped and the first drag imprecise.
3. Video assets selected from the library are always inserted as six seconds even when the source is longer.
4. Video is revealed after metadata is available rather than after a decoded frame is available, which can show a black canvas preview. The clip program monitor is also forced muted with no user control.

The apparently missing model connection state in a newly launched worktree is a separate development-profile issue: project data and model settings live in different locations. This change must not alter or migrate model configuration.

## Scope

- Give the clip ruler and media lane non-overlapping vertical regions.
- Add a right-side ruler safety inset and a wider clip-node default/bounds so `00:30` remains readable and draggable content has breathing room.
- Probe a selected video's real duration before adding it to the clip node, with the existing six-second value only as a failure fallback.
- Reuse the existing filmstrip cache for clip-node video thumbnails.
- Keep deferred canvas video visually hidden until `loadeddata` confirms a decoded frame, while retaining metadata callbacks for sizing.
- Add a standard mute/unmute control to the clip program monitor and preserve the user's choice while the monitor is open.
- Add focused unit/component tests and a repeatable Electron user-journey check using a local MP4 with an audio stream.

## Non-goals

- No model catalog schema, API-key storage, settings-directory, or updater changes.
- No change to project storage paths.
- No new media decoding framework or thumbnail pipeline.
- No redesign of the full timeline editor or export pipeline.
- No automatic playback with sound before an explicit user gesture.

## Interaction contract

- Time labels are always above the clip lane; media pixels and borders cannot enter the label region.
- The last visible major tick is aligned inside the content edge rather than centered across it.
- A 30-second initial view keeps trailing interaction space after the `00:30` label.
- Selecting a video adds its real finite duration; failed probes fall back to six seconds without blocking import.
- A canvas video placeholder remains visible until the browser has decoded usable frame data.
- Canvas video uses normal sound when the user presses its native play control. The clip monitor starts muted, exposes one icon button in the existing player control cluster, and enables audio after the user presses it.

## Implementation boundaries

- Geometry and time mapping stay in `clipNodeTimelineLayout.ts`; JSX consumes derived values rather than duplicating constants.
- Asset-to-source conversion accepts an optional resolved duration; probing stays in the async UI/import boundary.
- Frame readiness belongs to `DeferredNodeVideo`, the shared queued video renderer, so every generation-node entry gets the same fix.
- Thumbnail rendering reuses `useFilmstrip`; no direct autoplaying thumbnail video is added.

## Verification gates

- Unit tests cover the 30-second right inset, stable clip scale, real/fallback asset duration, and loaded-data readiness.
- Component coverage checks the mute toggle's accessible state and video `muted` property.
- A real Electron journey imports a video with an audio stream, confirms a non-black canvas/clip thumbnail, opens the clip monitor, toggles sound, and verifies export audio with `ffprobe` when the export path is available.
- Inspect desktop and constrained-width screenshots from the same fresh task build.
- Run repository gates: filesize, tokens, i18n, controls, lint, typecheck, tests, and build.

## Rollback

The change is isolated to clip-node layout/media rendering and focused tests. Reverting the task commit restores the previous geometry and loading behavior without a data migration. Existing clip metadata remains readable because no persisted fields change.

## Delivery

- Worktree: `/Users/aoqimin/Desktop/Nomi-clip-media-fixes-20260816`
- Branch: `codex/clip-node-media-fixes-20260816`
- Baseline: `origin/main@3fbb8f39`
- Delivery: scoped commit, pushed task branch, pull request; never direct-push `main`.

## Results

- Implemented independent ruler/media geometry, a 48px trailing label inset, and a 760px default clip-node width with 560-960px resize bounds.
- Video asset insertion now probes real duration and keeps six seconds only as the failure fallback.
- Clip thumbnails reuse the shared filmstrip cache; queued canvas videos remain hidden until `HAVE_CURRENT_DATA` and preload the first frame.
- Canvas video no longer forces `muted`; the clip program monitor has an explicit mute/unmute button and starts muted until the user opts into sound.
- Expanded `tests/ux/clip-node-editing.walk.mjs` with a generated 12-second H.264/AAC fixture and repeatable assertions for geometry, decoded frames, audio state, real duration, and exported audio.
- Focused tests: 19 passed.
- Real Electron task: all assertions passed, including default canvas audio; `ffprobe` confirmed an exported audio stream.
- Screenshots inspected:
  - `/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-clip-node-compact.png`
  - `/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-clip-node-preview.png`
  - `/var/folders/f4/vz86j5nd0_sf56qdhzrmbbvw0000gn/T/nomi-clip-node-imported-video.png`
- Full gates passed: 541 test files passed, 1 skipped; 4716 tests passed, 1 skipped; production renderer and Electron builds passed.
- Model connection-state investigation confirmed no updater migration issue: the stable packaged profile has 10 credential records, while the isolated development worktree profiles have none.
