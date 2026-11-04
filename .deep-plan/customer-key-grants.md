# Store customer API-key grants directly

`.deep-plan/` can be gitignored; this is a working plan, not a commit.

## The problem

Customer API keys are authorized as grants, but persisted as two older shapes:

- `customer_keys.scopes` stores what the key can do.
- `customer_keys_relations` stores which environments the key can reach.

Authentication joins those shapes into `ApiKeyPrincipal.scopes` and
`ApiKeyPrincipal.environmentIds` (`packages/shared/lib/services/account.service.ts:748`).
`buildPrincipal` then maps them into grants on every request
(`packages/server/lib/authz/principal.ts:18`). Grants are the authorization
contract but not the storage contract.

Webhook signing keys used to share these tables. The current top branch reads
them only from `webhook_signing_keys`
(`packages/shared/lib/services/webhookSigningKey.service.ts:83`). The final
destructive grants migration must still wait until that signing-key cleanup is
deployed to every server and jobs replica.

## Today

An environment API key is a `customer_keys` row with scopes such as
`['environment:*']` and one or more environment relation rows. An account API
key has account scopes and no relation row. Product writes enforce the
account/environment split, although the current mapper can represent malformed
or historical mixed keys.

The Bearer-key lookup finds a live key by hash, loads valid undeleted
environments in the same account through relations, returns `scopes` and
`environmentIds`, infers an environment only when exactly one remains, and
finally builds grants in memory.

Relations and scopes are also read by:

- environment-key listing and account-key classification
  (`packages/shared/lib/services/customerKey.service.ts:78`)
- name uniqueness and the per-environment key cap
  (`packages/shared/lib/services/customerKey.service.ts:226`)
- rename, scope update, and deletion ownership checks
  (`packages/shared/lib/services/customerKey.service.ts:328`)
- sandbox-token parent checks
  (`packages/sandbox/lib/api-keys/sandbox-api-key.service.ts:59`)
- sandbox-token authentication, which currently chooses one parent relation
  with an unordered `LIMIT 1`
  (`packages/shared/lib/services/account.service.ts:582`)
- scope-less ownership through `canAccessApiKeyTarget`, which reads
  `ApiKeyPrincipal.environmentIds`
  (`packages/utils/lib/api-key-authorization.ts:20`)
- hard environment deletion through a database trigger
  (`packages/database/lib/migrations/20260420120000_create_customer_keys.cjs:45`)

## After

`customer_keys.grants` is a non-null JSONB array. It stores customer-issued
selectors, not expanded concrete scopes:

```json
[
  {
    "can": ["environment:*"],
    "where": ["env:42"]
  }
]
```

An account key stores:

```json
[
  {
    "can": ["account:environments:list"],
    "where": ["account"]
  }
]
```

`can` remains the issued selector vocabulary. Wildcards are expanded through
`issuedGrant` when the row becomes a runtime principal, so they cannot reach
private scopes. `where` is the sole ownership source. There is no
`environment_id` column and no relation table.

A grant with an empty `can` is retained when it has a `where`. For example,
`[{ "can": [], "where": ["env:42"] }]` proves membership to scope-less
`withEnvironmentTarget` routes
(`packages/server/lib/middleware/environment-target.middleware.ts:10`) while
authorizing no scope.

Stored JSON is untrusted input. A shared decoder accepts only arrays of objects
containing string arrays, filters `can` to public selectors, filters `where` to
issuable selectors, and fails closed for malformed values. It then calls
`issuedGrant`. The database guarantees a non-null JSON array; application
validation owns the vocabulary.

Authentication extracts concrete `env:<id>` selectors, joins those ids to
undeleted environments in the key's account, and preserves existing
single-environment inference. Invalid, cross-account, or missing ids never
become authorization targets.

Runtime API-key principals carry grants. Customer keys use decoded stored
grants directly. Connect sessions, sandbox tokens, `api_secret`, and `env_var`
credentials synthesize grants at their authentication boundary.

Membership queries use exact JSON containment after filtering by `account_id`.
The existing account index and product caps keep those scans bounded; this
stack does not add a GIN index without production evidence that one is needed.

An environment scope PATCH replaces the whole legacy scope set today. Its
grant equivalent is: collect every environment `where`, replace the grants with
one environment grant containing the submitted `can`, and drop any malformed
legacy account grant. This preserves multi-environment ownership and today's
behavior of removing account scopes.

Sandbox tokens gain a signed `environment_id` claim. Minting already knows the
environment; authentication uses the verified claim rather than choosing an
arbitrary relation. Existing v1 verification ignores additional claims, so the
prefix does not change. Claim-less tokens receive a temporary legacy fallback
for one maximum token lifetime.

The HTTP API continues to call the user-facing field `scopes`. Requests map to
stored `can`; responses derive `scopes` from `can`.

## What will look different

- `packages/types/lib/environment/db.ts` adds the persisted grant JSON shape and
  ultimately replaces `DBCustomerKey.scopes` with `grants`. The persisted shape
  lives in `@nangohq/types` because `@nangohq/authz` already depends on it.
- `packages/authz/lib/authorize.ts` gains the fail-closed stored-grant decoder.
  `issuedGrant` remains the trust boundary
  (`packages/authz/lib/authorize.ts:52`).
- `customerKey.service.ts` writes grants, queries ownership from `where`, and
  stops touching relations.
- `account.service.ts` migrates ordinary key auth and
  `getAccountContextBySandboxApiKey`.
- `principal.ts` uses customer-key grants directly and only synthesizes grants
  for non-persisted credentials.
- Sandbox token minting stores `environment_id`; authentication selects parent
  grants that apply to that environment.
- `canAccessApiKeyTarget` and `withEnvironmentTarget` check grant `where`
  independently of `can`.
- Hard environment deletion matches an exact `env:<id>` selector.
- `customer_keys.scopes`, `customer_keys_relations`,
  `DBCustomerKeyRelation`, and obsolete helpers disappear in the final PR.

## What deliberately does not change

- Secret generation, encryption, hashing, UUIDs, soft deletion, or
  `last_used_at`.
- Scope names, wildcard semantics, private-scope protection, API field names,
  audit vocabulary, or dashboard copy.
- Key caps and display-name uniqueness domains.
- Single-environment inference.
- Product enforcement that newly issued keys are either account- or
  environment-scoped.
- Hard-deleting any environment named by a key's `where` deletes the whole key,
  including a historical multi-environment key. This matches today's trigger.
- Webhook signing behavior.
- Historical migrations.

## Approach and rejected alternatives

Store raw grants on `customer_keys`. A separate one-row grants table adds a
join without an independent lifecycle.

Use `where` as ownership. Keeping `environment_id` or relations would
dual-write the same fact forever.

Store selectors rather than expanded scopes. This preserves the behavior where
an existing wildcard key picks up a newly public catalogue scope.

The backfill preserves legacy authorization without widening it:

- environment selectors pair with valid same-account environment relations
- account selectors pair with `account`
- a relation with no environment selectors produces an empty-`can`
  environment grant
- mixed selectors produce separate account and environment grants

The migration aborts with offending ids for orphaned, cross-account, or
`entity_type = 'account'` relations. Soft-deleted environments remain in
stored `where` but are filtered during active auth.

Do not add a GIN index initially. Product queries filter by `account_id`, and
the hard-delete trigger has `OLD.account_id`. Add one later only if query plans
or latency justify it.

## Why three releases are enough

The expand and read switches share PR 1 because every new reader is
grants-first with a legacy fallback:

1. During PR 1's roll, an old writer can create a null-grants key. New readers
   fall back to scopes and relations. New writers dual-write, so old readers
   can read their keys.
2. An old writer can also PATCH scopes on a backfilled row. A temporary
   database trigger detects `scopes` changing while `grants` is unchanged and
   sets `grants = NULL`; new readers then use the updated legacy value instead
   of stale, potentially broader grants.
3. Once every replica is on PR 1, PR 2 can stop legacy writes because all PR 1
   readers understand grants-only keys.
4. Once every replica is on PR 2, PR 3 can drop the legacy schema.

The fallback must be a separate query invoked only for `grants IS NULL`. The
primary query must not contain a relation join, or an old PR 2 replica would
fail to parse it after PR 3 drops the table.

## The stack

### PR 1 — `feat(authz): persist customer key grants`

Expand, dual-write, and make every reader grants-capable.

- Add nullable `customer_keys.grants JSONB` and a JSON-array constraint.
- Put the idempotent backfill in a migration helper.
- Backfill all API keys, including soft-deleted keys.
- Install a temporary `BEFORE UPDATE OF scopes` trigger. If scopes changes
  while grants is unchanged, set grants to null. A PR 1 dual-write changes both
  and remains intact.
- Dual-write grants, scopes, and relations on create and scope update.
- Read grants first; issue a separate legacy lookup only for null grants.
- Resolve active environments from `where`.
- Move listing, caps, uniqueness, mutation ownership, sandbox minting, sandbox
  auth, scope-less ownership, and hard deletion to grants first, with a
  null-grants fallback where needed.
- Add signed `environment_id` to newly minted sandbox tokens.
- Verify a sandbox token before trusting the claim. Claim-less tokens use a
  temporary relation fallback.
- Preserve sandbox semantics: deploy gets `environment:deploy` only when the
  parent has it in that environment; dryrun inherits that environment's parent
  selectors and still adds `connections:read`, `integrations:read`, and
  `proxy`. Account grants do not enter an environment sandbox token.
- Normalize synthetic credentials to grants.
- Derive compatibility `scopes` metadata from `can`.

Before merging, run production anomaly preflights. During rollout, old-created
or old-updated keys are safe because null grants use the fallback.

### PR 2 — `refactor(authz): stop legacy customer key writes`

Make grants the only written shape while retaining the old schema.

- Start only after every server and jobs replica is on PR 1.
- Wait 24 hours after the final PR 1 replica so claim-less sandbox tokens
  expire.
- Re-run the backfill for `grants IS NULL`, validate the constraint, and set
  `grants NOT NULL`.
- Keep the separate null fallback because jobs may boot before a server runs
  the migration; after catch-up it is unreachable.
- Stop writing `customer_keys.scopes` and `customer_keys_relations`.
- Remove transitional principal `scopes` and `environmentIds`; retain only
  derived compatibility metadata where needed.
- Keep the nullable `scopes` column and relation table physically present.
- Keep the invalidation trigger. With grants non-null, an accidental
  scopes-only write fails rather than silently changing authorization.

PR 1 replicas can read grants-only keys from PR 2, so rolling forward and
rolling back remain safe.

### PR 3 — `refactor(authz): drop legacy customer key authorization storage`

Remove the old schema after every process is on PR 2.

- Assert that no key has null or malformed grants.
- Assert webhook signing code no longer depends on relations.
- Remove the null-grants auth fallback.
- Remove the claim-less sandbox-token relation fallback.
- Remove the temporary invalidation trigger.
- Drop `customer_keys.scopes`.
- Drop `customer_keys_relations`.
- Drop obsolete relation types, constants, helpers, and tests.
- Keep the grants-based hard-delete trigger.

This is the point of no return. Its `down` is empty. Recovery is a forward fix
or backup restore; application rollback to PR 1 is unsupported after this
migration.

## TDD seams

Work vertically: one failing behavior, minimum production change, then the
next behavior.

### 1. Migration helper

Test the helper directly against PostgreSQL. Cover environment, account, mixed,
wildcard, empty-scope, multi-environment, soft-deleted, idempotent, catch-up,
and anomaly cases. This is the one seam where exact stored JSON assertions are
appropriate.

### 2. Customer-key service

Use create, account create, search, scope update, rename, and delete. Cover
dual-write, grants-only writes, exact scope-PATCH semantics, caps, uniqueness,
and account/environment listing.

### 3. Authentication and principal

Use `getAccountContextByApiKey` followed by `principalCan`. Cover stored-grant
decoding, wildcard issuance, account isolation, single/multi-env resolution,
malformed fail-closed behavior, null fallback, and grants being authoritative
when non-null legacy scopes disagree.

### 4. Public HTTP

Keep a compact end-to-end set: create, patch, list, authorize, deny, and delete
one environment key and one account key. This catches route wiring, response
`scopes`, audits, and 403 behavior without duplicating storage tests.

### 5. Sandbox

Mint and authenticate tokens with a signed environment claim. Cover a
claim-less token during compatibility, a multi-environment parent, a malformed
mixed parent, deploy narrowing, and deliberate dryrun base-scope widening.

### 6. Hard delete

Hard-delete an environment and assert that keys whose `where` contains the
exact environment are removed while account and unrelated environment keys
survive. Soft delete retains key material but prevents active resolution.

### 7. Rolling compatibility

Simulate a PR 0 replica with direct legacy SQL: update only `scopes` on a row
whose grants were backfilled. Assert that the trigger nulls grants and a PR 1
read observes the updated scopes. Remove the trigger once during TDD and verify
the test goes red.

## Red → green order

### PR 1

1. Backfill one environment key.
2. Add account, empty-`can`, mixed, multi-env, soft-delete, anomaly, and
   idempotence cases individually.
3. Create environment and account keys and observe dual-write.
4. PATCH scopes and observe one replacement environment grant: submitted
   `can`, all previous environment `where`, no malformed account grant.
5. Simulate an old-replica scopes-only PATCH; observe invalidation and fallback.
6. Authenticate from grants while non-null legacy scopes disagree.
7. Exercise null-grants fallback.
8. Cover environment resolution and malformed selectors.
9. Move scope-less ownership to grants and prove empty `can` membership.
10. Move listing, mutation, caps, and uniqueness to `where`.
11. Mint and authenticate sandbox tokens with and without the new claim.
12. Replace hard deletion.
13. Run existing authorization-equivalence and scope-enforcement suites.

### PR 2

1. Create and patch grants-only keys with no new scopes or relation writes.
2. Authenticate, list, mutate, and sandbox-mint those keys.
3. Remove transitional principal fields after behavior is green.

### PR 3

1. Refuse to drop while null or malformed grants remain.
2. Drop legacy objects for valid data.
3. Re-run PR 1 and PR 2 behavioral suites against the contracted schema.

## Migration and deploy order

Migrations run on server boot; jobs do not run them. Every gate means all
server and jobs replicas.

- Before PR 1, run production preflights that return zero rows:
  - relation environment is missing
  - relation environment belongs to another account
  - `entity_type = 'account'`
- PR 1 → PR 2: every reader understands grants-only keys, every writer
  dual-writes grants, and 24 hours have passed since the final PR 1 replica.
- PR 2 → PR 3: every writer has stopped touching legacy storage.
- The signing-key cleanup release is everywhere before PR 3.

PR 1 may have an executable `down` that removes the trigger, constraint, and
column because legacy storage is still complete. `scopes` is already nullable,
so PR 2 needs no schema change to stop populating it. PR 2 catch-up data is
harmless on rollback. PR 3 has an empty `down`.

No feature flag is needed.

## Risks and the point of no return

**PR 1 must migrate every reader.** This includes ordinary auth, sandbox auth
and minting, `withEnvironmentTarget`, listing, caps, mutation ownership, audit
lookups, and hard deletion.

**Old replicas update existing rows.** Creation fallback is insufficient. The
invalidation trigger prevents a narrowed key from retaining stale wider grants.

**Malformed JSON fails closed.** It must not crash auth or become broader.

**Scope/where pairing must survive.** Flattening mixed grants can authorize a
capability against the wrong target plane.

**Sandbox permissions are environment-local.** New tokens carry a signed
environment id. Dryrun base scopes remain intentionally additive; account
grants are excluded.

**Containment is exact.** `env:42` must not match `env:420`.

**PR 3 is irreversible.** Take a verified backup or snapshot and run preflight
queries before deployment.

## Verification

Run from the repository root after `npm install`:

```bash
npm run test:unit -- packages/authz/lib/authorize.unit.test.ts
npm run test:unit -- packages/server/lib/authz/principal.unit.test.ts
npm run test:unit -- packages/server/lib/authz/grants-equivalence.unit.test.ts
npm run test:unit -- packages/utils/lib/api-key-authorization.unit.test.ts
npm run test:integration -- packages/database/lib/customerKeyGrants.integration.test.ts
npm run test:integration -- packages/shared/lib/services/account.service.integration.test.ts
npm run test:integration -- packages/server/lib/controllers/v1/environment/apiKeys.integration.test.ts
npm run test:integration -- packages/server/lib/controllers/v1/account/apiKeys/apiKeys.integration.test.ts
npm run test:integration -- packages/server/lib/controllers/v1/environment/scopeEnforcement.integration.test.ts
npm run test:integration -- packages/sandbox/lib/api-keys/sandbox-api-key.integration.test.ts
npm run lint
npm run format:check
```

Integration tests require Docker. Use one red → green slice at a time.

## Settled decisions

- Three releases.
- Stored raw selectors; issue them at read time.
- `where` is ownership.
- Temporary stale-grant invalidation trigger.
- Signed `environment_id` on new v1 sandbox tokens.
- Temporary claim-less-token fallback and 24-hour gate.
- No initial GIN index.
- Seven TDD seams.
- PR 1 has an executable additive `down`; PR 3's destructive `down` is empty.
