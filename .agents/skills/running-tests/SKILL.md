---
name: running-tests
description: Use when running tests in the Nango monorepo - knows unit vs integration configs, vitest commands, Docker setup, and common test patterns
---

# Running Tests in Nango

## Overview

Nango uses Vitest with three separate configs for unit, integration, and CLI tests. Getting the config wrong silently runs zero tests.

## Quick Reference

| Type | Command | Config | File pattern |
|------|---------|--------|-------------|
| Unit | `npx vitest run` | `vite.config.ts` | `*.unit.test.ts` |
| Integration | `npx vitest run --config ./vite.integration.config.ts` | `vite.integration.config.ts` | `*.integration.test.ts` |
| CLI | `npx vitest run --config ./vite.cli.config.ts` | `vite.cli.config.ts` | `*.unit.cli-test.ts` |
| All | `npm run test` | all three | all patterns |

## Running Specific Tests

```bash
# Single integration test file
npx vitest run --config ./vite.integration.config.ts packages/server/lib/controllers/v1/team/getTeam.integration.test.ts

# Single unit test file
npx vitest run packages/server/lib/authz/permissions.unit.test.ts

# Pattern match
npx vitest run --config ./vite.integration.config.ts -t "should be protected"
```

All commands run from the **repo root**.

## Before Running Tests

**Always run `npm install` first** — after pulling changes, switching branches, or in a fresh worktree. Missing deps cause import errors that look like code issues.

## Integration Test Requirements

- **Docker required**: Global setup (`tests/setup.ts`) starts PostgreSQL, Elasticsearch, ActiveMQ, and Redis via testcontainers
- Tests run **sequentially** (`fileParallelism: false`, `singleFork: true`)
- Timeout: 20 seconds per test
- Environment: `FLAG_AUTH_ROLES_ENABLED=true`, timezone UTC

## Writing Integration Tests

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seeders } from '@nangohq/shared';
import { runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

const route = '/api/v1/endpoint';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer(); // Starts Express + runs all migrations
    });
    afterAll(() => { api.server.close(); });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' } });
        shouldBeProtected(res);
    });
});
```

**Key utilities** (`packages/server/lib/utils/tests.ts`):
- `runServer()` — starts Express with DB migrations
- `shouldBeProtected(res)` — asserts 401
- `shouldRequireQueryEnv(res)` — asserts 400 missing env
- `authenticateUser(api, user, password)` — returns session cookie (use for endpoints needing `res.locals.user`)
- `isSuccess(json)` / `isError(json)` — response type guards

**Seeders** (`@nangohq/shared`):
- `seeders.seedAccountEnvAndUser()` — creates account, environment, user, secret key

## Custom Matchers

Available in all tests via `tests/setupFiles.ts`:
- `toBeIsoDate()`, `toBeIsoDateTimezone()`, `toBeUUID()`, `toBeSha256()`
- `toBeWithinMs(expected, toleranceMs)`

## Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Wrong config for integration tests | 0 tests found | Use `--config ./vite.integration.config.ts` |
| Using bearer token for session endpoints | 401 errors | Use `authenticateUser()` + session cookie |
| Running from package dir | Config not found | Always run from repo root |
| Docker not running | Connection refused | Integration tests need Docker for testcontainers |
| Missing `query: { env: 'dev' }` | 400 invalid query | Most endpoints require env query param |
