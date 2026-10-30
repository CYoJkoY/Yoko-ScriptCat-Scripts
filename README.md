# Yoko-ScriptCat-Scripts

My current collection of ScriptCat scripts is solely for quick searching and development.

## Scripts

| Script | Install | Docs |
| --- | --- | --- |
| AI Chat Turbo Engine | [dist/ai-chat-turbo-engine.user.js](dist/ai-chat-turbo-engine.user.js) | [docs/ai-chat-turbo-engine.md](docs/ai-chat-turbo-engine.md) |
| Gemini Quota Capsule | [dist/gemini-quota-capsule.user.js](dist/gemini-quota-capsule.user.js) | [docs/gemini-quota-capsule.md](docs/gemini-quota-capsule.md) |
| HeyBox Up | [dist/heybox-up.user.js](dist/heybox-up.user.js) | [docs/heybox-up.md](docs/heybox-up.md) |

Every script installs from a single self-contained `dist/<script-id>.user.js` file. Source lives under `scripts/` and is written in native TypeScript; there is no runtime framework and no external module loading.

Builds used to be published from `scripts/<script-id>.js`. That path no longer exists, so reinstall once from the table above to pick up the new `@updateURL`; after that, updates flow through `dist/` as usual.

## Layout

```text
shared/                     Cross-script helpers (DOM, storage, utilities, metadata)
scripts/<script-id>/        One workspace per userscript
  meta.ts                   Userscript header metadata
  src/index.ts              Entry point and lifecycle wiring
  src/config.ts             Constants, selectors, storage keys
  src/ui/                   Native DOM construction and injected CSS
  src/core/                 Business logic modules
  tsconfig.json             Per-script compiler scope
tools/                      esbuild builder, differential CI planner, bundle checks
tests/                      Vitest suites
dist/                       Generated userscripts committed for CDN installs
```

## Requirements

Node.js 22.12 or newer and pnpm 12. Both are pinned in `package.json`; dependencies are locked in `pnpm-lock.yaml`.

## Commands

```bash
pnpm install              # install the shared toolchain
pnpm build                # build every userscript into dist/
pnpm build -- --target heybox-up   # build one userscript
pnpm watch                # rebuild on changes under scripts/ and shared/
pnpm typecheck            # strict tsc check for shared tooling and every script
pnpm test                 # Vitest
pnpm check                # typecheck, tests, and build in one run
```

The builder reads each `scripts/<script-id>/meta.ts`, renders the metadata header, bundles `src/index.ts` with esbuild, and writes `dist/<script-id>.user.js`. `tools/verify-bundles.ts` asserts that each artifact keeps a closed header, stays self-contained, and avoids module syntax.

## Continuous integration

`.github/workflows/ci-build.yml` diffs the branch against its base commit and type-checks plus builds only the workspaces that changed. Changes under `shared/`, `tools/`, `tests/`, or to the root configuration re-verify every script, because those files affect all of them.

## License

MIT

