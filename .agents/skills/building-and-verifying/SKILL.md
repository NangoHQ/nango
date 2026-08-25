---
name: building-and-verifying
description: Use when building the Nango monorepo or verifying TypeScript compilation - covers build commands, project references, common tsc errors, and package dependency order
---

# Building and Verifying Nango

## Overview

Nango is a TypeScript monorepo using npm workspaces and TypeScript project references (no Turborepo/Nx). Build order matters — packages depend on each other via `tsconfig.build.json` references.

## Quick Reference

| Command | Purpose | When to use |
|---------|---------|-------------|
| `npm run ts-build` | Full TypeScript build with project refs | After cross-package changes |
| `npx tsc -p packages/server/tsconfig.build.json --noEmit` | Type-check single package | Quick check during development |
| `npm run ts-clean && npm run ts-build` | Clean rebuild | When incremental build gives stale errors |
| `npm install` | Install deps + link workspaces | After changing dependencies or in fresh worktree |

All commands run from the **repo root**.

## Package Dependency Layers

Build order follows `tsconfig.build.json` references:

1. **Core**: `types`, `utils`, `frontend` — no internal deps
2. **Infrastructure**: `database`, `kvstore`, `logs`, `keystore`
3. **Services**: `shared`, `node-client`, `nango-yaml`, `runner`, `scheduler`, `orchestrator`
4. **Applications**: `server`, `webapp`, `connect-ui`, `cli`

**Key rule**: `@nangohq/types` is **declaration-only** (`emitDeclarationOnly: true`). It cannot export runtime values — only TypeScript types. Runtime consts go in `@nangohq/utils`.

## Build Workflow

**Always run `npm install` before building** — after pulling new changes, switching branches, or in a fresh worktree/checkout. Missing or outdated `node_modules` causes `Cannot find module` errors that look like code issues but are just missing deps.

```bash
# Standard build flow
npm install
npm run ts-build
```

## Verifying Changes

```bash
# After editing types used across packages — full build
npm run ts-build

# After editing only server code — single package check
npx tsc -p packages/server/tsconfig.build.json --noEmit

# After editing shared + server — build the dependency chain
npx tsc -p packages/shared/tsconfig.build.json && npx tsc -p packages/server/tsconfig.build.json --noEmit
```

## New Worktree Setup

Fresh worktrees need dependencies installed:

```bash
npm install
```

Without this, `npx tsc` and other tools won't be available.

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find module 'X' or its corresponding type declarations` | Dependencies not installed or outdated | Run `npm install` first |
| `Failed to resolve entry for package '@nangohq/types'` | Trying to import runtime value from types package | Move the value to `@nangohq/utils` — types is declaration-only |
| `Cannot find module '@nangohq/shared'` in build | Dependency not built yet | Run `npm run ts-build` (full build) or build dependency first |
| Stale `.tsbuildinfo` giving phantom errors | Incremental build cache is wrong | `npm run ts-clean && npm run ts-build` |
| `Type 'X' is not assignable to type 'Y'` across packages | Types package changed but dependents not rebuilt | Full rebuild: `npm run ts-build` |
| Missing `dist/` directory | Package never built or cleaned | `npm run ts-build` |

## Adding New Endpoint Types

When adding API endpoint types:

1. Define the type in `packages/types/lib/` (appropriate subdirectory)
2. Export from `packages/types/lib/index.ts`
3. Add to `APIEndpoints` union in `packages/types/lib/api.endpoints.ts`
4. Run `npm run ts-build` to verify
