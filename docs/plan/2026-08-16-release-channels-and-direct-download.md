# Release Channels And Direct Download

Date: 2026-08-16

## Goal

Turn the existing tag-triggered desktop build into a controlled delivery path:

1. feature branches produce installable preview builds without touching stable user data;
2. a selected release ref produces one immutable RC artifact set;
3. an approved promotion publishes that exact artifact set instead of rebuilding it;
4. unsigned macOS updates open the Nomi website with the exact CPU architecture and start the correct DMG download automatically.

## Scope

- Isolate `pnpm dev` settings and projects below the worktree `.tmp` directory.
- Add a side-by-side `Nomi Preview` electron-builder configuration.
- Add pull-request/manual preview packaging.
- Add manual RC packaging with version/ref validation and an immutable manifest.
- Replace tag-side rebuilding with promotion of an approved RC workflow run.
- Align pull-request CI with the repository `gates` command and user-journey checks.
- Route the updater manual-download action to `nomiaqm.com` with explicit platform/architecture parameters.
- Add one-shot website auto-download behavior and focused contracts.
- Replace repository-local direct-main delivery instructions with branch/PR delivery.

## Out Of Scope

- No product workflow, model, canvas, timeline, or export behavior changes.
- No macOS Developer ID, notarization, or Windows Authenticode certificate provisioning; those require external credentials.
- No beta auto-update feed. Preview builds remain manually installed and separate from stable.
- No automatic merge, PR approval, or release approval.

## Delivery Model

```text
feature/* or fix/*
  -> PR + optional Nomi Preview artifacts
  -> selected release/* ref
  -> Desktop RC workflow (build once)
  -> production-release environment approval
  -> Desktop Release workflow promotes the same artifacts
```

Selection happens at PR/commit granularity, never by copying individual files out of a mixed worktree.

## Interaction Contract

### Normal website visit

- Download links keep their current layout, focus behavior, and no-JavaScript GitHub Releases fallback.
- A user click resolves the platform immediately before navigation so an asynchronous architecture lookup cannot leave a stale link.
- Unknown platforms remain on the public Releases fallback instead of receiving a guessed installer.

### App update visit

- Electron opens `https://nomiaqm.com/?download=1&source=app-update&platform=darwin&arch=<process.arch>`.
- The website treats the parameters as a one-shot intent, removes them from browser history, and starts the matching stable installer download once.
- The app supplies `arm64` or `x64`; Safari is not asked to infer Apple Silicon from the ambiguous `MacIntel` user agent.
- If parameters are invalid or unsupported, no automatic navigation occurs and the normal download buttons remain usable.
- Locale redirects preserve the query string until the one-shot download is resolved.

## Data Isolation

- Stable keeps its existing `Nomi` settings and `~/Documents/Nomi Projects` default.
- `pnpm dev` defaults to `.tmp/electron-user-data/dev-<port>` and a projects directory inside that same profile.
- Explicit `NOMI_ELECTRON_USER_DATA_DIR` and `NOMI_PROJECTS_DIR` overrides still win.
- `Nomi Preview` uses a distinct app id, product name, output directory, and default projects folder.

## Release Guards

- RC input version must match `package.json`.
- RC records repository, commit SHA, version, timestamp, and workflow run in `release-manifest.json`.
- Promotion downloads artifacts from the selected RC run and validates the manifest repository, version, and commit.
- The promoted commit must be contained in `origin/main`.
- The tag must not already point elsewhere.
- macOS arm64 DMG, macOS x64 DMG, Windows installer, and updater metadata are required; missing assets fail the job.
- The promotion job uses the `production-release` GitHub Environment so required reviewers can be configured in repository settings.

## Rollback

- Website routing can be reverted independently by restoring the prior GitHub Releases URL and client script.
- Preview/RC workflows are additive; disabling the workflow files stops them without changing application runtime behavior.
- Stable release promotion creates a new immutable GitHub Release. Rollback is a new patch release from the previous good commit; published tags are not rewritten.

## Acceptance

- Download-selection contracts cover explicit app parameters, browser detection, unsupported platforms, and one-shot query handling.
- Dev profile tests prove default isolation and explicit override behavior.
- Marketing static build/checks pass for both locales.
- `pnpm run gates`, `pnpm run test:e2e`, and focused updater/download tests pass.
- Workflow YAML parses and all referenced package scripts/config files exist.
