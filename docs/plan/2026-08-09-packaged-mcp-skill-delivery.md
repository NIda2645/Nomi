# Packaged MCP Skill Delivery

## Problem

The packaged Nomi MCP server exposes all 13 tools, but a build launched outside the repository cannot discover built-in director and writer skills. The package whitelist includes `resources/**` while the built-in skill packs live under `skills/**`. Repository-based tests passed because `getSkillsRoots()` also checks `process.cwd()/skills`.

## Scope

- Include the existing `skills/**` tree in the application package.
- Add a package smoke test that launches the built app from an isolated working directory.
- Verify MCP initialize, all 13 tools, skill resource discovery, and full director skill reading.
- Run the smoke test automatically after the macOS directory build.

## Non-goals

- Do not change skill lookup precedence or user-imported skill behavior.
- Do not add another skill copy or fallback path.
- Do not change Production Run tools, approvals, or public claims.

## Acceptance

1. `pnpm run gates` passes.
2. `pnpm run dist:mac:dir` passes its packaged MCP smoke test from an isolated `cwd`.
3. The installed `/Applications/Nomi Production.app` reports 13 tools and can read `director.cinematography`.
4. Claude Code, Codex, and Cursor all use the installed binary and pass real initialization.
