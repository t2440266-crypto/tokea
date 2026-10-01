# Tokea System

## Stack

- **Language / Runtime**: TypeScript (strict) in the browser; no server
- **Framework**: none — Vite 7 + vanilla DOM (PWA)
- **Key dependencies**: none at runtime; dev only: `vite`, `typescript`, `vitest`
- **Package manager**: npm
- (no architecture spec exists; seeded from `package.json` and the scaffold)

## Build approach

**Tracer Bullet** — each gap built end to end, UI plus persistence plus tests, working before the next starts.

## Commands

```bash
# Install
npm install

# Dev server
npm run dev

# Build
npm run build

# Test
npm run test

# Full gate (build + tests + tsc)
npm run verify
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title.md` (directory shape: `NNNN-title/index.md` + `rationale.md` + `verify.md`). Feature scope: `docs/scope/scope.md`.

## Rules

- Functional style: pure functions by default; side effects (storage writes via `emit`, DOM) stay at the edges and explicit. No classes where a plain function works.
- Data immutable: spread, never rebuild a `DayEntry` from scratch — day entry updates merge so `startedId` and `note` cannot be dropped.
- TypeScript strict, no `any`; `tsc --noEmit` must stay green (`npm run verify`).
- Accessibility baseline: interactive elements carry accessible names, visible focus, ≥44px targets.
- Named exports only.
- Schedule and topic engines (`src/schedule.ts`, `src/topics.ts`) stay pure: inputs to outputs, no DOM, fully unit tested.
- Storage lives under `daydriver:v1` in `localStorage`; every mutation calls `emit`, every `emit` persists.
- Zero runtime dependencies; adding any dependency needs explicit engineer approval (MASTERPROMPT lock).
- UI copy: sentence case, plain verbs, no shaming words (no failed/wasted/ashamed).

## Tooling (installed)

- Lint + format: ESLint (flat config, `typescript-eslint` recommended) + Prettier (`singleQuote`, `printWidth: 100`). `npm run lint`, `npm run format`, `npm run format:check`.
- Pre-commit: husky + lint-staged (eslint --fix + prettier on staged `.ts`, prettier on the rest) then `tsc --noEmit`, via `.husky/pre-commit`.
- CI: `.github/workflows/ci.yml` — lint, format check, and `npm run verify` on push and pull request.
- Test runner: vitest, tied to `npm run verify`.

## Git

- integration: on
- branch prefix: feat/
- commit: per-milestone

## Agent skills

- [vite](.agents/skills/vite/): `antfu/skills`, Vite config, plugins, build and perf tuning
- [vitest](.agents/skills/vitest/): `antfu/skills`, Vitest mocking, config, patterns

Declined: vite-patterns, typescript-best-practices
MCP servers: none found (vite, typescript, vitest — registry lookup timed out; build-time tools need no backend)

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
