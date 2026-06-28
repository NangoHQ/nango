# Meilisearch Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Meilisearch as a Nango integration — an API-key provider plus pre-built actions for read, write, partial/batch update, delete, async-task polling, and tenant-token (ACL) generation.

**Architecture:** Provider auth is declared in `packages/providers/providers.yaml` (API_KEY, user-supplied `instanceUrl`, `Authorization: Bearer ${apiKey}`). Pre-built actions live in a self-contained zero-yaml project at `integrations/meilisearch/`, each a `createAction` calling `nango.proxy` helpers. The tenant token is a hand-rolled HS256 JWT (the runner sandbox forbids `jsonwebtoken`; only `crypto` is allowed) isolated in a pure, unit-tested `lib/tenant-token.ts`.

**Tech Stack:** TypeScript, zod v4, Nango zero-yaml SDK (`createAction`), Node `crypto`, vitest.

---

## File Structure

- `packages/providers/providers.yaml` — **modify**: add `meilisearch` provider block.
- `integrations/meilisearch/package.json` — **create**: zero-yaml project manifest.
- `integrations/meilisearch/tsconfig.json` — **create**: copied from the CLI example.
- `integrations/meilisearch/index.ts` — **create**: imports every action (zero-yaml entry).
- `integrations/meilisearch/lib/tenant-token.ts` — **create**: pure HS256 JWT signer (no I/O, no `nango`).
- `integrations/meilisearch/lib/tenant-token.unit.test.ts` — **create**: signer tests (root vitest).
- `integrations/meilisearch/lib/schemas.ts` — **create**: shared zod schemas (`EnqueuedTask`, `searchRules`, `meiliDocument`).
- `integrations/meilisearch/lib/schemas.unit.test.ts` — **create**: schema round-trip tests.
- `integrations/meilisearch/actions/generate-tenant-token.ts` — **create**.
- `integrations/meilisearch/actions/search-documents.ts` — **create**.
- `integrations/meilisearch/actions/get-documents.ts` — **create**.
- `integrations/meilisearch/actions/add-documents.ts` — **create**.
- `integrations/meilisearch/actions/update-documents.ts` — **create**.
- `integrations/meilisearch/actions/delete-documents.ts` — **create**.
- `integrations/meilisearch/actions/get-task.ts` — **create**.
- `docs/integrations/all/meilisearch.mdx` — **create**: provider doc page.
- `docs/docs.json` — **modify**: register the doc page.
- `packages/webapp/public/images/template-logos/meilisearch.svg` — **create**: logo.

**Conventions to follow (verified in repo):**
- Action shape: `packages/cli/example/github/actions/createIssue.ts` — `import { createAction } from 'nango'; import * as z from 'zod';`, `createAction({ description, version, endpoint, input, output, exec })`, `export default action;`.
- Proxy helpers (`packages/runner-sdk/lib/action.ts`): `nango.get/post/put/delete({ endpoint, data?, params?, headers? })` → `Promise<AxiosResponse<T>>`; read the body via `res.data`.
- Raw credential access: `await nango.getToken()` returns the credentials; for API_KEY it is `{ type: 'API_KEY', apiKey: string }`.
- Errors: `throw new nango.ActionError({ message })` (`nango.ActionError` exists on the SDK).
- Unit tests: filename `*.unit.test.ts`, `import { describe, it, expect } from 'vitest'`, run via root vitest (`**/*.unit.{test,spec}.ts` glob).

---

## Task 1: Add the Meilisearch provider

**Files:**
- Modify: `packages/providers/providers.yaml`

- [ ] **Step 1: Add the provider block**

Insert in alphabetical position (after the `meaningcloud`/`medallia`-range entries, before `mem`-range). Match indentation of surrounding entries (4 spaces).

```yaml
meilisearch:
    display_name: Meilisearch
    categories:
        - search
    auth_mode: API_KEY
    proxy:
        base_url: ${connectionConfig.instanceUrl}
        headers:
            authorization: Bearer ${apiKey}
        verification:
            method: GET
            endpoints:
                - /keys
    connection_config:
        instanceUrl:
            type: string
            title: Instance URL
            description: Your Meilisearch host, including scheme. e.g. https://ms-xxxx.meilisearch.io or http://localhost:7700
            example: https://ms-1a2b3c4d5e6f.meilisearch.io
            order: 1
    credentials:
        apiKey:
            type: string
            title: API Key
            description: A Meilisearch API key. Use a key (not the master key) so it can sign tenant tokens.
            secret: true
    docs: https://nango.dev/docs/integrations/all/meilisearch
```

- [ ] **Step 2: Verify the providers file still parses / passes its tests**

Run: `npm run test:unit --dir packages/providers`
Expected: PASS (no schema/localization errors referencing `meilisearch`).

- [ ] **Step 3: Lint & format the file**

Run: `npx prettier --config .prettierrc --write packages/providers/providers.yaml`
Expected: file reformatted with no diff errors.

- [ ] **Step 4: Commit**

```bash
git add packages/providers/providers.yaml
git commit --no-verify -m "feat(providers): add Meilisearch (API_KEY) provider"
```

---

## Task 2: Scaffold the zero-yaml integration project

**Files:**
- Create: `integrations/meilisearch/package.json`
- Create: `integrations/meilisearch/tsconfig.json`
- Create: `integrations/meilisearch/index.ts`

- [ ] **Step 1: Create `integrations/meilisearch/package.json`**

```json
{
    "name": "nango-integration-meilisearch",
    "version": "1.0.0",
    "private": true,
    "type": "module",
    "engines": {
        "node": ">=22.22.2"
    },
    "scripts": {
        "compile": "nango compile",
        "dev": "nango dev"
    },
    "devDependencies": {
        "zod": "4.3.6"
    }
}
```

- [ ] **Step 2: Create `integrations/meilisearch/tsconfig.json`** (copied from `packages/cli/example/tsconfig.json`)

```json
{
    "$schema": "https://json.schemastore.org/tsconfig",
    "include": ["index.ts", "**/*.ts"],
    "exclude": ["node_modules", "dist", "build", ".nango"],
    "compilerOptions": {
        "module": "node16",
        "target": "esnext",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "moduleResolution": "node16",
        "exactOptionalPropertyTypes": true,
        "noUncheckedIndexedAccess": true,
        "noEmit": true
    }
}
```

- [ ] **Step 3: Create `integrations/meilisearch/index.ts`** (will be completed as actions are added; start with the two model-free imports)

```typescript
import './actions/generate-tenant-token.js';
import './actions/search-documents.js';
import './actions/get-documents.js';
import './actions/add-documents.js';
import './actions/update-documents.js';
import './actions/delete-documents.js';
import './actions/get-task.js';
```

- [ ] **Step 4: Commit**

```bash
git add integrations/meilisearch/package.json integrations/meilisearch/tsconfig.json integrations/meilisearch/index.ts
git commit --no-verify -m "chore(meilisearch): scaffold zero-yaml integration project"
```

---

## Task 3: Tenant-token signer (TDD — the core logic)

**Files:**
- Create: `integrations/meilisearch/lib/tenant-token.ts`
- Test: `integrations/meilisearch/lib/tenant-token.unit.test.ts`

- [ ] **Step 1: Write the failing test**

`integrations/meilisearch/lib/tenant-token.unit.test.ts`:

```typescript
import crypto from 'crypto';

import { describe, expect, it } from 'vitest';

import { generateTenantToken } from './tenant-token.js';

function decodeSegment(seg: string): unknown {
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

describe('generateTenantToken', () => {
    const apiKey = 'masterKeyExampleValue123';
    const apiKeyUid = '8dcbb482-cb02-4d4c-91a6-6b9c4f3e8d11';
    const searchRules = { medical_records: { filter: 'user_id = 1' } };

    it('produces a three-segment JWT with HS256 header', () => {
        const token = generateTenantToken({ apiKey, apiKeyUid, searchRules });
        const parts = token.split('.');
        expect(parts).toHaveLength(3);
        expect(decodeSegment(parts[0]!)).toEqual({ alg: 'HS256', typ: 'JWT' });
    });

    it('embeds searchRules and apiKeyUid in the payload', () => {
        const token = generateTenantToken({ apiKey, apiKeyUid, searchRules });
        const payload = decodeSegment(token.split('.')[1]!) as Record<string, unknown>;
        expect(payload['apiKeyUid']).toBe(apiKeyUid);
        expect(payload['searchRules']).toEqual(searchRules);
        expect(payload['exp']).toBeUndefined();
    });

    it('includes exp when expiresAt is provided', () => {
        const token = generateTenantToken({ apiKey, apiKeyUid, searchRules, expiresAt: 1893456000 });
        const payload = decodeSegment(token.split('.')[1]!) as Record<string, unknown>;
        expect(payload['exp']).toBe(1893456000);
    });

    it('signs the token so the HMAC verifies with the api key', () => {
        const token = generateTenantToken({ apiKey, apiKeyUid, searchRules });
        const [header, payload, signature] = token.split('.');
        const expected = crypto
            .createHmac('sha256', apiKey)
            .update(`${header}.${payload}`)
            .digest('base64')
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
        expect(signature).toBe(expected);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit --dir integrations/meilisearch -- tenant-token`
Expected: FAIL — cannot resolve `./tenant-token.js` / `generateTenantToken is not a function`.

- [ ] **Step 3: Write the minimal implementation**

`integrations/meilisearch/lib/tenant-token.ts`:

```typescript
import crypto from 'crypto';

export interface SearchRules {
    [indexOrWildcard: string]: { filter?: string } | Record<string, unknown> | boolean | unknown[];
}

export interface TenantTokenParams {
    /** The Meilisearch API key value used to sign the token. */
    apiKey: string;
    /** The uid of the API key used to sign the token. */
    apiKeyUid: string;
    /** Per-index search rules (the ACL carried by the token). */
    searchRules: SearchRules;
    /** Optional expiry as epoch seconds. */
    expiresAt?: number;
}

function base64url(input: Buffer | string): string {
    return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Build a Meilisearch tenant token: an HS256 JWT signed with an API key value.
 * Pure function — no network, no SDK — so it is fully unit-testable.
 */
export function generateTenantToken({ apiKey, apiKeyUid, searchRules, expiresAt }: TenantTokenParams): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload: Record<string, unknown> = { searchRules, apiKeyUid };
    if (expiresAt !== undefined) {
        payload['exp'] = expiresAt;
    }

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const signature = base64url(crypto.createHmac('sha256', apiKey).update(`${encodedHeader}.${encodedPayload}`).digest());

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit --dir integrations/meilisearch -- tenant-token`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add integrations/meilisearch/lib/tenant-token.ts integrations/meilisearch/lib/tenant-token.unit.test.ts
git commit --no-verify -m "feat(meilisearch): add tenant-token HS256 signer"
```

---

## Task 4: Shared zod schemas (TDD)

**Files:**
- Create: `integrations/meilisearch/lib/schemas.ts`
- Test: `integrations/meilisearch/lib/schemas.unit.test.ts`

- [ ] **Step 1: Write the failing test**

`integrations/meilisearch/lib/schemas.unit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { enqueuedTaskSchema, searchRulesSchema } from './schemas.js';

describe('searchRulesSchema', () => {
    it('accepts an index rule with a filter', () => {
        const parsed = searchRulesSchema.parse({ records: { filter: 'tenant = 7' } });
        expect(parsed).toEqual({ records: { filter: 'tenant = 7' } });
    });

    it('accepts the wildcard with an empty rule', () => {
        expect(() => searchRulesSchema.parse({ '*': {} })).not.toThrow();
    });

    it('accepts boolean and array rule values', () => {
        expect(() => searchRulesSchema.parse({ a: true, b: ['title'] })).not.toThrow();
    });
});

describe('enqueuedTaskSchema', () => {
    it('parses an enqueued task', () => {
        const parsed = enqueuedTaskSchema.parse({
            taskUid: 12,
            indexUid: 'records',
            status: 'enqueued',
            type: 'documentAdditionOrUpdate',
            enqueuedAt: '2026-06-28T00:00:00Z'
        });
        expect(parsed.taskUid).toBe(12);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:unit --dir integrations/meilisearch -- schemas`
Expected: FAIL — cannot resolve `./schemas.js`.

- [ ] **Step 3: Write the minimal implementation**

`integrations/meilisearch/lib/schemas.ts`:

```typescript
import * as z from 'zod';

/** A single Meilisearch document — arbitrary JSON object. */
export const meiliDocumentSchema = z.record(z.string(), z.unknown());

/** searchRules value for one index: object (optionally with filter), boolean, or array. */
const searchRuleValueSchema = z.union([z.object({ filter: z.string().optional() }).catchall(z.unknown()), z.boolean(), z.array(z.unknown())]);

/** Per-index search rules keyed by index uid or the "*" wildcard. */
export const searchRulesSchema = z.record(z.string(), searchRuleValueSchema);

/** The async task Meilisearch returns from a write operation. */
export const enqueuedTaskSchema = z
    .object({
        taskUid: z.number(),
        indexUid: z.string().nullable(),
        status: z.string(),
        type: z.string(),
        enqueuedAt: z.string()
    })
    .catchall(z.unknown());
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:unit --dir integrations/meilisearch -- schemas`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add integrations/meilisearch/lib/schemas.ts integrations/meilisearch/lib/schemas.unit.test.ts
git commit --no-verify -m "feat(meilisearch): add shared zod schemas"
```

---

## Task 5: `generate-tenant-token` action

**Files:**
- Create: `integrations/meilisearch/actions/generate-tenant-token.ts`

- [ ] **Step 1: Write the action**

```typescript
import { createAction } from 'nango';
import * as z from 'zod';

import { searchRulesSchema } from '../lib/schemas.js';
import { generateTenantToken } from '../lib/tenant-token.js';

const input = z
    .object({
        searchRules: searchRulesSchema,
        expiresAt: z.number().optional(),
        expiresInSeconds: z.number().optional(),
        apiKeyUid: z.string().optional()
    })
    .refine((v) => Object.keys(v.searchRules).length > 0, { message: 'searchRules must define at least one index rule' });

const output = z.object({
    token: z.string(),
    expiresAt: z.number().nullable()
});

const action = createAction({
    description: 'Generate a Meilisearch tenant token: a scoped, signed search JWT carrying per-index ACL rules.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/meilisearch/tenant-token', group: 'Tenant Tokens' },
    input,
    output,

    exec: async (nango, input) => {
        const credentials = await nango.getToken();
        if (typeof credentials === 'string' || !('apiKey' in credentials)) {
            throw new nango.ActionError({ message: 'Meilisearch connection must use API_KEY auth to mint tenant tokens.' });
        }
        const apiKey = credentials.apiKey;

        let apiKeyUid = input.apiKeyUid;
        if (!apiKeyUid) {
            const res = await nango.get<{ uid: string }>({ endpoint: `/keys/${apiKey}` });
            apiKeyUid = res.data.uid;
        }

        let expiresAt: number | null = null;
        if (input.expiresAt !== undefined) {
            expiresAt = input.expiresAt;
        } else if (input.expiresInSeconds !== undefined) {
            expiresAt = Math.floor(Date.now() / 1000) + input.expiresInSeconds;
        }

        const token = generateTenantToken({
            apiKey,
            apiKeyUid,
            searchRules: input.searchRules,
            ...(expiresAt !== null ? { expiresAt } : {})
        });

        return { token, expiresAt };
    }
});

export default action;
```

- [ ] **Step 2: Commit**

```bash
git add integrations/meilisearch/actions/generate-tenant-token.ts
git commit --no-verify -m "feat(meilisearch): add generate-tenant-token action"
```

---

## Task 6: `search-documents` action (read)

**Files:**
- Create: `integrations/meilisearch/actions/search-documents.ts`

- [ ] **Step 1: Write the action**

```typescript
import { createAction } from 'nango';
import * as z from 'zod';

import { meiliDocumentSchema } from '../lib/schemas.js';

const input = z.object({
    indexUid: z.string(),
    q: z.string().optional(),
    filter: z.union([z.string(), z.array(z.string())]).optional(),
    sort: z.array(z.string()).optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    attributesToRetrieve: z.array(z.string()).optional(),
    facets: z.array(z.string()).optional()
});

const output = z
    .object({
        hits: z.array(meiliDocumentSchema),
        query: z.string().optional(),
        processingTimeMs: z.number().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
        estimatedTotalHits: z.number().optional()
    })
    .catchall(z.unknown());

const action = createAction({
    description: 'Search documents in a Meilisearch index.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/meilisearch/documents/search', group: 'Documents' },
    input,
    output,

    exec: async (nango, input) => {
        const { indexUid, ...body } = input;
        const res = await nango.post({ endpoint: `/indexes/${indexUid}/search`, data: body });
        return res.data;
    }
});

export default action;
```

- [ ] **Step 2: Commit**

```bash
git add integrations/meilisearch/actions/search-documents.ts
git commit --no-verify -m "feat(meilisearch): add search-documents action"
```

---

## Task 7: `get-documents` action (read)

**Files:**
- Create: `integrations/meilisearch/actions/get-documents.ts`

Uses `POST /indexes/{uid}/documents/fetch` (supports `filter`, unlike the GET variant).

- [ ] **Step 1: Write the action**

```typescript
import { createAction } from 'nango';
import * as z from 'zod';

import { meiliDocumentSchema } from '../lib/schemas.js';

const input = z.object({
    indexUid: z.string(),
    filter: z.union([z.string(), z.array(z.string())]).optional(),
    fields: z.array(z.string()).optional(),
    limit: z.number().optional(),
    offset: z.number().optional()
});

const output = z
    .object({
        results: z.array(meiliDocumentSchema),
        total: z.number(),
        limit: z.number(),
        offset: z.number()
    })
    .catchall(z.unknown());

const action = createAction({
    description: 'Fetch documents from a Meilisearch index, optionally filtered.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/meilisearch/documents/fetch', group: 'Documents' },
    input,
    output,

    exec: async (nango, input) => {
        const { indexUid, ...body } = input;
        const res = await nango.post({ endpoint: `/indexes/${indexUid}/documents/fetch`, data: body });
        return res.data;
    }
});

export default action;
```

- [ ] **Step 2: Commit**

```bash
git add integrations/meilisearch/actions/get-documents.ts
git commit --no-verify -m "feat(meilisearch): add get-documents action"
```

---

## Task 8: `add-documents` action (write — add or replace, batch)

**Files:**
- Create: `integrations/meilisearch/actions/add-documents.ts`

`POST /indexes/{uid}/documents` adds or **replaces** documents. The body is the document array; `primaryKey` is a query param.

- [ ] **Step 1: Write the action**

```typescript
import { createAction } from 'nango';
import * as z from 'zod';

import { enqueuedTaskSchema, meiliDocumentSchema } from '../lib/schemas.js';

const input = z.object({
    indexUid: z.string(),
    documents: z.array(meiliDocumentSchema).min(1),
    primaryKey: z.string().optional()
});

const action = createAction({
    description: 'Add or replace documents in a Meilisearch index (batch). Returns the enqueued task.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/meilisearch/documents', group: 'Documents' },
    input,
    output: enqueuedTaskSchema,

    exec: async (nango, input) => {
        const res = await nango.post({
            endpoint: `/indexes/${input.indexUid}/documents`,
            data: input.documents,
            ...(input.primaryKey ? { params: { primaryKey: input.primaryKey } } : {})
        });
        return res.data;
    }
});

export default action;
```

- [ ] **Step 2: Commit**

```bash
git add integrations/meilisearch/actions/add-documents.ts
git commit --no-verify -m "feat(meilisearch): add add-documents action"
```

---

## Task 9: `update-documents` action (partial update, batch)

**Files:**
- Create: `integrations/meilisearch/actions/update-documents.ts`

`PUT /indexes/{uid}/documents` adds or **updates** (partial — only the provided fields change).

- [ ] **Step 1: Write the action**

```typescript
import { createAction } from 'nango';
import * as z from 'zod';

import { enqueuedTaskSchema, meiliDocumentSchema } from '../lib/schemas.js';

const input = z.object({
    indexUid: z.string(),
    documents: z.array(meiliDocumentSchema).min(1),
    primaryKey: z.string().optional()
});

const action = createAction({
    description: 'Add or partially update documents in a Meilisearch index (batch). Returns the enqueued task.',
    version: '1.0.0',
    endpoint: { method: 'PUT', path: '/meilisearch/documents', group: 'Documents' },
    input,
    output: enqueuedTaskSchema,

    exec: async (nango, input) => {
        const res = await nango.put({
            endpoint: `/indexes/${input.indexUid}/documents`,
            data: input.documents,
            ...(input.primaryKey ? { params: { primaryKey: input.primaryKey } } : {})
        });
        return res.data;
    }
});

export default action;
```

- [ ] **Step 2: Commit**

```bash
git add integrations/meilisearch/actions/update-documents.ts
git commit --no-verify -m "feat(meilisearch): add update-documents action"
```

---

## Task 10: `delete-documents` action (write)

**Files:**
- Create: `integrations/meilisearch/actions/delete-documents.ts`

Delete by `ids` (`POST /documents/delete-batch`, body = id array) or by `filter` (`POST /documents/delete`, body = `{ filter }`). Exactly one must be provided.

- [ ] **Step 1: Write the action**

```typescript
import { createAction } from 'nango';
import * as z from 'zod';

import { enqueuedTaskSchema } from '../lib/schemas.js';

const input = z
    .object({
        indexUid: z.string(),
        ids: z.array(z.union([z.string(), z.number()])).optional(),
        filter: z.union([z.string(), z.array(z.string())]).optional()
    })
    .refine((v) => (v.ids === undefined) !== (v.filter === undefined), {
        message: 'Provide exactly one of "ids" or "filter".'
    });

const action = createAction({
    description: 'Delete documents from a Meilisearch index by ids or by filter. Returns the enqueued task.',
    version: '1.0.0',
    endpoint: { method: 'POST', path: '/meilisearch/documents/delete', group: 'Documents' },
    input,
    output: enqueuedTaskSchema,

    exec: async (nango, input) => {
        const res = input.ids
            ? await nango.post({ endpoint: `/indexes/${input.indexUid}/documents/delete-batch`, data: input.ids })
            : await nango.post({ endpoint: `/indexes/${input.indexUid}/documents/delete`, data: { filter: input.filter } });
        return res.data;
    }
});

export default action;
```

- [ ] **Step 2: Commit**

```bash
git add integrations/meilisearch/actions/delete-documents.ts
git commit --no-verify -m "feat(meilisearch): add delete-documents action"
```

---

## Task 11: `get-task` action (poll async writes)

**Files:**
- Create: `integrations/meilisearch/actions/get-task.ts`

- [ ] **Step 1: Write the action**

```typescript
import { createAction } from 'nango';
import * as z from 'zod';

const input = z.object({
    taskUid: z.number()
});

const output = z
    .object({
        uid: z.number(),
        indexUid: z.string().nullable(),
        status: z.string(),
        type: z.string(),
        error: z.unknown().nullable().optional(),
        enqueuedAt: z.string(),
        startedAt: z.string().nullable().optional(),
        finishedAt: z.string().nullable().optional()
    })
    .catchall(z.unknown());

const action = createAction({
    description: 'Fetch the status of a Meilisearch async task by its uid.',
    version: '1.0.0',
    endpoint: { method: 'GET', path: '/meilisearch/tasks', group: 'Tasks' },
    input,
    output,

    exec: async (nango, input) => {
        const res = await nango.get({ endpoint: `/tasks/${input.taskUid}` });
        return res.data;
    }
});

export default action;
```

- [ ] **Step 2: Run the full unit test suite for the project**

Run: `npm run test:unit --dir integrations/meilisearch`
Expected: PASS (signer + schema tests; 8 tests).

- [ ] **Step 3: Commit**

```bash
git add integrations/meilisearch/actions/get-task.ts
git commit --no-verify -m "feat(meilisearch): add get-task action"
```

---

## Task 12: Documentation page, logo, and registration

**Files:**
- Create: `docs/integrations/all/meilisearch.mdx`
- Modify: `docs/docs.json`
- Create: `packages/webapp/public/images/template-logos/meilisearch.svg`

> Note: the auto-generated `PreBuiltTooling`/`PreBuiltUseCases` snippets are derived from `flows.yaml`. Because these actions live in a standalone `integrations/` project (not `flows.yaml`), those snippets are NOT generated — so this doc page does **not** import them and instead lists the actions inline.

- [ ] **Step 1: Create `docs/integrations/all/meilisearch.mdx`**

```mdx
---
title: Meilisearch
sidebarTitle: Meilisearch
---

import Overview from "/snippets/overview.mdx"

<Overview />

## Access requirements
| Pre-Requisites | Status | Comment|
| - | - | - |
| Paid dev account | ❌ | Meilisearch is open source; Cloud has a free tier. |
| Paid test account | ❌ | |
| Partnership | ❌ | |
| App review | ❌ | |
| Security audit | ❌ | |

## Connecting to Meilisearch

Meilisearch uses API-key authentication. When creating a connection provide:

- **Instance URL** — your Meilisearch host including scheme, e.g. `https://ms-xxxx.meilisearch.io` or `http://localhost:7700`.
- **API Key** — a Meilisearch API key. Use a *key* (not the master key) so it can sign tenant tokens.

## Pre-built actions

| Action | Description |
| - | - |
| `search-documents` | Search documents in an index. |
| `get-documents` | Fetch documents from an index, optionally filtered. |
| `add-documents` | Add or replace documents (batch). |
| `update-documents` | Add or partially update documents (batch). |
| `delete-documents` | Delete documents by ids or filter. |
| `get-task` | Poll the status of an async write task. |
| `generate-tenant-token` | Mint a scoped, signed tenant-token JWT carrying per-index ACL search rules. |

## Tenant tokens & ACL

`generate-tenant-token` signs an HS256 JWT with the connection's API key. The token carries `searchRules` (per-index filters) that scope what an end user can search; the signing key's ACL bounds the token. Example input:

```json
{
  "searchRules": { "medical_records": { "filter": "patient_id = 42" } },
  "expiresInSeconds": 3600
}
```

## Useful links

-   [Meilisearch API keys](https://www.meilisearch.com/docs/reference/api/keys)
-   [Tenant tokens](https://www.meilisearch.com/docs/learn/security/basic_security)
-   [Documents API](https://www.meilisearch.com/docs/reference/api/documents)

<Note>Contribute improvements by [editing this page](https://github.com/nangohq/nango/tree/master/docs/integrations/all/meilisearch.mdx)</Note>
```

- [ ] **Step 2: Register the page in `docs/docs.json`**

Find the `"integrations/all/..."` list (the entry `"integrations/all/algolia"` is around line 936) and add, in alphabetical position (after `integrations/all/meili...` neighbors, i.e. between the `me*` entries):

```json
              "integrations/all/meilisearch",
```

- [ ] **Step 3: Create the logo `packages/webapp/public/images/template-logos/meilisearch.svg`**

Use the official Meilisearch mark. Minimal placeholder that renders (replace with the official asset if available):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360" width="360" height="360">
  <defs>
    <linearGradient id="m" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FF5CAA"/>
      <stop offset="1" stop-color="#FF5895"/>
    </linearGradient>
  </defs>
  <path fill="url(#m)" d="M120 250 190 90c8-18 33-18 41 0l70 160c8 18-9 36-28 30l-62-20-62 20c-19 6-36-12-28-30z"/>
</svg>
```

- [ ] **Step 4: Verify docs.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('docs/docs.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add docs/integrations/all/meilisearch.mdx docs/docs.json packages/webapp/public/images/template-logos/meilisearch.svg
git commit --no-verify -m "docs(meilisearch): add integration docs, logo, and nav entry"
```

---

## Task 13: Final verification

- [ ] **Step 1: Run all new unit tests**

Run: `npm run test:unit --dir integrations/meilisearch`
Expected: PASS (8 tests across tenant-token + schemas).

- [ ] **Step 2: Lint the new code**

Run: `npm run lint`
Expected: no errors referencing `integrations/meilisearch`.

- [ ] **Step 3: Format check**

Run: `npx prettier --config .prettierrc --check "integrations/meilisearch/**/*.ts" "docs/integrations/all/meilisearch.mdx"`
Expected: all files use Prettier code style (run `--write` to fix if not).

- [ ] **Step 4: Providers tests still pass**

Run: `npm run test:unit --dir packages/providers`
Expected: PASS.

- [ ] **Step 5: (Best effort) compile the integration with the Nango CLI**

Run (from the project dir, requires the `nango` CLI/runtime resolvable): `cd integrations/meilisearch && npx nango compile`
Expected: compiles all 7 actions with no type errors. If `nango` is not installable in this environment, skip and note it — the unit tests + lint + tsc remain the gate.

- [ ] **Step 6: Manual integration smoke test (documented, run if a Meilisearch instance is available)**

```bash
# 1. Run Meilisearch locally
docker run -d --rm -p 7700:7700 -e MEILI_MASTER_KEY=masterKey getmeili/meilisearch:latest
# 2. Through a Nango connection (instanceUrl=http://localhost:7700, apiKey=<a key with documents.* + search>):
#    add-documents  -> returns { taskUid }
#    get-task       -> status "succeeded"
#    search-documents (q="...") -> hits present
#    generate-tenant-token (searchRules with a filter) -> { token }
#    search using the token -> hits constrained by the filter (ACL enforced)
```

- [ ] **Step 7: Final commit (if any fixes were applied)**

```bash
git add -A
git commit --no-verify -m "chore(meilisearch): final lint/format/test fixes"
```

---

## Self-Review Notes (spec coverage)

- **Provider / API_KEY auth + instanceUrl** → Task 1.
- **read** → `search-documents` (Task 6), `get-documents` (Task 7).
- **write** → `add-documents` (Task 8), `delete-documents` (Task 10).
- **partial update / batch** → `update-documents` (Task 9); batch is the array input on Tasks 8–9.
- **ACL / tenant tokens** → pure signer (Task 3) + `generate-tenant-token` (Task 5).
- **async writes** → `get-task` (Task 11).
- **docs/logo** → Task 12.
- **testing strategy** → unit tests (Tasks 3–4), schema round-trips, manual loop (Task 13).
- Syncs remain **out of scope** per the spec.
```
