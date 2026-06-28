# Meilisearch integration for Nango — Design

**Date:** 2026-06-28
**Status:** Approved (design phase)

## Goal

Add Meilisearch as a first-class Nango integration: a provider definition for
API-key authentication plus pre-built actions covering read, write, partial
(batch) update, document deletion, and — the central requirement — **tenant
token generation** so that Meilisearch's per-tenant ACL/multitenancy can be
driven through Nango.

## Background — how the pieces map to Nango

- **Auth.** A Meilisearch deployment (Cloud or self-hosted) is reached via an
  **instance URL** + an **API key**. The key is sent as `Authorization: Bearer <key>`.
  This maps to Nango's `API_KEY` auth mode with a user-supplied `base_url`.
- **Tenant tokens.** A tenant token is **not** a stored credential. It is a
  short-lived JWT (HS256) that the holder *generates* by signing with an
  existing API key. Its payload carries `searchRules` (per-index filters) that
  scope what an end user may search, plus the signing key's `apiKeyUid` and an
  `exp`. The signing key's ACL is the upper bound on the token's power; tenant
  tokens are search-only. Master keys **cannot** sign tenant tokens — only API
  keys can.
- **Async writes.** Meilisearch document writes are asynchronous: they return an
  `EnqueuedTask` (`{ taskUid, indexUid, status, type, enqueuedAt }`), not the
  written data. Callers poll `GET /tasks/{taskUid}` to observe completion.

## Verified codebase facts (de-risking)

- New integrations use the **zero-yaml** convention: `createAction` /
  `createSync` with **zod** schemas for `input`/`output`. Provider auth lives in
  `packages/providers/providers.yaml`. (`packages/cli/example/github/actions/createIssue.ts`
  is the reference shape.)
- Action scripts **can read raw credentials**: `await nango.getConnection()`
  returns `credentials` typed as `AllAuthCredentials`; for `API_KEY` that
  includes `credentials.apiKey` (the real secret). Confirmed in
  `packages/runner-sdk/lib/action.ts` and `packages/types/lib/auth/api.ts`.
  This makes local JWT signing possible.
- The runner sandbox require-allowlist (`packages/runner/lib/exec.ts`) is:
  `url`, `crypto`, `zod`, `botbuilder`, `soap`, `unzipper`. **`jsonwebtoken` and
  `jose` are NOT allowed.** Therefore the HS256 JWT must be hand-rolled using
  the `crypto` module (`createHmac` + base64url encoding).
- Shipped integration action scripts canonically live in the external
  `github.com/NangoHQ/integration-templates` repo and are compiled into the
  generated `packages/shared/flows.zero.json`. That JSON is **generated and will
  not be hand-edited**. In this repo we author a self-contained zero-yaml
  project under `integrations/meilisearch/`.

## Components

### 1. Provider definition — `packages/providers/providers.yaml`

```yaml
meilisearch:
    display_name: Meilisearch
    categories: [search]
    auth_mode: API_KEY
    proxy:
        base_url: ${connectionConfig.instanceUrl}
        headers:
            authorization: Bearer ${apiKey}
        verification:
            method: GET
            endpoints: [/keys]
    connection_config:
        instanceUrl:
            type: string
            title: Instance URL
            description: Your Meilisearch host, e.g. https://ms-xxxx.meilisearch.io or http://localhost:7700
            order: 1
    credentials:
        apiKey:
            type: string
            title: API Key
            description: A Meilisearch API key (must be a key, not the master key, to mint tenant tokens)
            secret: true
    docs: https://nango.dev/docs/integrations/all/meilisearch
    docs_connect: https://nango.dev/docs/integrations/all/meilisearch/connect
```

Notes:
- `instanceUrl` includes the scheme so both Cloud (`https://…`) and self-hosted
  (`http://localhost:7700`) work.
- Verification uses `GET /keys`, which requires a valid key and the `keys.get`
  action — a meaningful check that the credential works.

### 2. In-repo integration project — `integrations/meilisearch/`

```
integrations/meilisearch/
  index.ts                       # registers/exports the actions (zero-yaml entry)
  lib/
    client.ts                    # thin helpers over nango.proxy (paths, error mapping)
    tenant-token.ts              # pure HS256 signer + base64url (unit-tested, no I/O)
    schemas.ts                   # shared zod schemas (SearchRules, EnqueuedTask, etc.)
  actions/
    search-documents.ts          # read
    get-documents.ts             # read
    add-documents.ts             # write (add or replace; batch via array)
    update-documents.ts          # partial update (add or update; batch via array)
    delete-documents.ts          # write (by ids or by filter)
    generate-tenant-token.ts     # ACL / tenant token (local JWT)
    get-task.ts                  # poll async EnqueuedTask
```

### 3. Actions

All actions take `indexUid` where relevant and call Meilisearch through
`nango.proxy` (base URL + auth injected by the provider proxy config). Inputs
and outputs are zod schemas.

| Action | Requirement | HTTP | Input (key fields) | Output |
|---|---|---|---|---|
| `search-documents` | read | `POST /indexes/{uid}/search` | `indexUid`, `q?`, `filter?`, `sort?`, `limit?`, `offset?`, `attributesToRetrieve?`, `facets?` | search response (`hits`, `estimatedTotalHits`, `processingTimeMs`, …) |
| `get-documents` | read | `GET /indexes/{uid}/documents` | `indexUid`, `ids?`, `filter?`, `fields?`, `limit?`, `offset?` | `{ results, total, limit, offset }` |
| `add-documents` | write (batch) | `POST /indexes/{uid}/documents` | `indexUid`, `documents[]`, `primaryKey?` | `EnqueuedTask` |
| `update-documents` | partial update (batch) | `PUT /indexes/{uid}/documents` | `indexUid`, `documents[]`, `primaryKey?` | `EnqueuedTask` |
| `delete-documents` | write | `POST /indexes/{uid}/documents/delete` (filter) or `…/delete-batch` (ids) | `indexUid`, one of `ids[]` \| `filter` | `EnqueuedTask` |
| `generate-tenant-token` | ACL / tenant tokens | local (no HTTP) | `searchRules`, `expiresAt?` \| `expiresInSeconds?`, `apiKeyUid?` | `{ token, expiresAt }` |
| `get-task` | poll | `GET /tasks/{taskUid}` | `taskUid` | task object (`status`, `error?`, …) |

"Batch update" is satisfied by the array-accepting `add-documents` /
`update-documents` (Meilisearch's native batching), not a separate action.
`delete-documents` validates that exactly one of `ids` / `filter` is provided.

### 4. `generate-tenant-token` — detailed flow

1. `const { credentials } = await nango.getConnection();` →
   `const apiKey = credentials.apiKey` (guard: must be `API_KEY` auth).
2. Resolve `apiKeyUid`:
   - if provided in input, use it;
   - else `GET /keys/{apiKey}` via `nango.proxy` and read `.uid`.
3. Compute `exp` from `expiresAt` (epoch seconds) or `expiresInSeconds`
   (default: a sensible short TTL, e.g. 1h; documented). `exp` is optional in
   Meilisearch but we encourage it.
4. Build the JWT in `lib/tenant-token.ts`:
   - `header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))`
   - `payload = base64url(JSON.stringify({ searchRules, apiKeyUid, exp? }))`
   - `signature = base64url(crypto.createHmac("sha256", apiKey).update(`${header}.${payload}`).digest())`
   - `token = `${header}.${payload}.${signature}``
5. Return `{ token, expiresAt }`.

`searchRules` zod type: a record keyed by `indexUid` or `"*"`, each value one of
`{ filter?: string }`, `true`, or `[]` (per Meilisearch's tenant-token spec).

### 5. Error handling

- `lib/client.ts` maps non-2xx Meilisearch responses (which carry
  `{ message, code, type, link }`) into clear thrown errors with the Meilisearch
  `code` surfaced, so action callers get actionable messages.
- `generate-tenant-token` throws a descriptive error if the connection is not
  API_KEY auth, if `apiKeyUid` cannot be resolved, or if `searchRules` is empty.
- `delete-documents` throws if neither/both of `ids`/`filter` are supplied.

### 6. Documentation & assets

- `docs/integrations/all/meilisearch.mdx` — overview + pre-built tooling/use-cases
  snippets, following the existing provider doc template (e.g. algolia).
- Setup guide page + registration in `docs.json`.
- `meilisearch.svg` logo under the template-logos location used by the webapp.

## Testing strategy

- **Unit (vitest), `lib/tenant-token.ts`:** the highest-value tests. Sign with a
  known key + rules and assert (a) the token has three base64url segments,
  (b) header/payload decode to the expected JSON, (c) the HMAC verifies against
  the key (recompute and compare), (d) `exp` is set correctly from both
  `expiresAt` and `expiresInSeconds`. Use a fixed reference vector.
- **Schema round-trips:** zod input/output parse for each action with
  representative payloads (including batch arrays and each `searchRules` shape).
- **Manual / integration:** run Meilisearch in Docker; exercise the full loop —
  `add-documents` → `get-task` (succeeded) → `search-documents` →
  `generate-tenant-token` (with a `filter`) → search using the token and confirm
  the ACL filter actually constrains the returned hits.

## Out of scope (YAGNI)

- Index / settings management actions (create index, update settings) — not part
  of the read/write/partial/tenant-token requirement.
- API-key CRUD actions (create/list/delete scoped keys). Considered during
  brainstorming and explicitly deferred; tenant tokens are derived from an
  existing key.
- Syncs (scheduled pulls). This integration is action-oriented.

## Open questions

None outstanding. Decisions captured above:
- Full integration (provider + actions). 
- Tenant tokens via a `generate-tenant-token` action (not as a stored credential).
- Action set includes `delete-documents`, `get-documents`, and `get-task`.
- Scripts live in a new `integrations/meilisearch/` project.
