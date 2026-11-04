# Move webhook signing keys out of customer_keys

## The problem

A webhook signing key is the HMAC secret Nango uses when it sends a webhook. It is stored as a `customer_keys` row with `key_type = 'webhook_signing'`, `scopes` null, and a `customer_keys_relations` row that points at the environment. API keys live in the same table. The next change stores API-key grants on `customer_keys` and then drops `customer_keys_relations`. Signing keys have to leave first, or that drop removes the only way to find the HMAC secret.

This plan is only that move. Grants, the `scopes` column, and API-key relations stay as they are.

## Today

Creating an environment inserts a signing key inside the same transaction as the default API key. `createWebhookSigningKey` writes a UUID into `customer_keys` (`scopes` null, display name `"Webhook signing"`) and a relation `(entity_type = 'environment', entity_id)` (`packages/shared/lib/services/customerKey.service.ts:330`, called from `packages/shared/lib/services/environment.service.ts:245`).

Every send, and the dashboard, loads that secret by joining `customer_keys` to `customer_keys_relations` on the environment id (`packages/shared/lib/services/customerKey.service.ts:383`). The plaintext is cached in process for five minutes (`packages/shared/lib/services/customerKey.service.ts:17`). The cache keeps a value whose `updated_at` is later than the row a slower read just loaded (`packages/shared/lib/services/customerKey.service.ts:393`). The settings screen bypasses the cache and only returns the secret when the caller has `environment:settings:read_secret` (`packages/server/lib/controllers/v1/environment/getEnvironment.ts:67`).

Product rotation locks the legacy row, overwrites it, and fills the cache (`packages/shared/lib/services/customerKey.service.ts:442`). `updated_at` is `clock_timestamp()` inside that lock (`packages/shared/lib/services/customerKey.service.ts:472`). It returns 404 when the environment has no live signing key and 409 when it has more than one. The one-off script soft-deletes the old row and inserts a new one (`scripts/one-off/rotate-webhook-signing-key/rotate.ts:60`). Callers of the product rotate are `POST /api/v1/environment/webhook-signing-key/rotate` (`packages/server/lib/routes.private.ts:328`) and `POST /environment/webhook-signing-key/rotate` (`packages/server/lib/routes.public.ts:406`).

Hard-deleting an environment runs `trg_env_delete_customer_key_relations`, which deletes every `customer_keys` row related to that environment, signing key included (`packages/database/lib/migrations/20260420120000_create_customer_keys.cjs:45`). Soft delete only sets `_nango_environments.deleted` (`packages/shared/lib/services/environment.service.ts:418`) and leaves the signing key in place.

The main database migrates when a server process boots, unless `NANGO_MIGRATE_AT_START` is set to `false` (`packages/server/lib/server.ts:82`). It defaults to `true` (`packages/server/lib/server.ts:39`). Jobs do not run that migration. A jobs replica can be on a new release while the migration is still waiting for the first new server boot.

## After

`webhook_signing_keys` holds one row per environment:

- `environment_id` integer, not null, unique, foreign key to `_nango_environments(id)` `ON DELETE CASCADE`
- `secret`, `iv`, `tag` — the same ciphertext columns `customer_keys` uses today
- `created_at`, `updated_at` — `updated_at` is copied from the legacy row, not set to the time of the copy

No `account_id`, hash, scopes, display name, `key_type`, or `deleted_at`. Nothing looks a signing key up by hash. Product rotation overwrites the single row. `ON DELETE CASCADE` replaces the trigger for this secret. The trigger still deletes API keys.

Reads load both rows and serve the one with the later `updated_at`. The cache stores that row's `updated_at`. On a tie, the secrets are the same and either row is fine; the read prefers `webhook_signing_keys`. A missing side is just the other row. On a cache miss this is two indexed lookups, at most once every five minutes per environment per process.

Writes that touch both rows run in one transaction, the same way rotate uses its inner transaction and create runs inside environment create. A crash rolls both back. The legacy update's `clock_timestamp()` is the value stored on both rows (`RETURNING updated_at`). The upsert into `webhook_signing_keys` is `ON CONFLICT (environment_id) DO UPDATE … WHERE webhook_signing_keys.updated_at < EXCLUDED.updated_at`, so an earlier write cannot overwrite a later one.

Four deploys. Server and jobs roll independently.

**Release 1.** Create the table and copy live signing rows (`deleted_at` null), preserving `updated_at`, joining `_nango_environments` so an orphaned relation cannot violate the foreign key. The copy aborts if any environment has two live signing keys. New code writes both rows with one timestamp, locking the legacy row first as rotation does today. Reads serve the newer row. A pre-release-1 replica writes only the legacy row, so that row is newer and wins. The one-off script inserts a fresh legacy row, so that row wins too. There is no "do not run the script" gate.

**Release 2.** Starts only once every server and jobs replica is on release 1. No soak. New code still reads whichever row is newer. Creates insert only `webhook_signing_keys`. Rotate upserts that table: if the new row is missing and a live legacy row exists, it inserts the new row from the rotation; it returns 404 only when both are missing. An environment created by a pre-release-1 replica during the release 1 roll has only a legacy row, and a plain update would 404 until release 3. A release 1 replica still running sees a release 2 rotation, because the new row's `updated_at` is later. It sees a release 2 environment create, because that create has only the new row. The reverse is accepted for the length of this roll: a release 1 replica rotating an environment that release 2 just created locks the legacy row, finds none, and returns 404.

**Release 3.** Starts only once every replica is on release 2, which no longer writes legacy rows. The migration copies legacy rows with `DISTINCT ON (environment_id) … ORDER BY updated_at DESC`, and only where that row is newer than `webhook_signing_keys` or the new row is missing. Then it deletes the legacy signing rows and their relations, and narrows `key_type` to `'api'` with `NOT VALID` plus `VALIDATE CONSTRAINT`, so the check does not hold `ACCESS EXCLUSIVE` on `customer_keys` for the whole scan. API-key auth reads that table. No row locks: nothing writes the legacy row anymore. The application keeps reading whichever row is newer. After the delete, that read finds only `webhook_signing_keys`. Jobs can boot this code before the first server runs the migration and still serve the right secret.

**Release 4.** Starts only once every replica is on release 3, so the legacy rows are already gone. The read stops querying `customer_keys` and `customer_keys_relations`. `CustomerKeyType` becomes `'api'`. The grants work that drops `customer_keys_relations` cannot start until this release is on every server and jobs replica. Shipping that drop in the same deploy runs the drop on first server boot while jobs still on release 3 execute the join, and those jobs stop sending signed webhooks.

## What will look different in the codebase

`packages/shared/lib/services/customerKey.service.ts` remains the module callers import. `createWebhookSigningKey`, `getWebhookSigningKeyForEnv`, `getUncachedWebhookSigningKeyForEnv`, and `rotateWebhookSigningKey` change what they read and write. Call sites in hooks, jobs, the webhook manager, and `getEnvironment` stay on those methods.

Release 1 adds `packages/database/lib/migrations/<timestamp>_create_webhook_signing_keys.cjs`. Before merging, run this against production and expect zero rows:

```sql
SELECT relation.entity_id, count(*)
FROM customer_keys
JOIN customer_keys_relations relation
  ON relation.customer_key_id = customer_keys.id
 AND relation.entity_type = 'environment'
WHERE customer_keys.key_type = 'webhook_signing'
  AND customer_keys.deleted_at IS NULL
GROUP BY relation.entity_id
HAVING count(*) > 1;
```

And this, also expecting zero rows (a relation whose environment is already gone):

```sql
SELECT relation.entity_id
FROM customer_keys
JOIN customer_keys_relations relation
  ON relation.customer_key_id = customer_keys.id
 AND relation.entity_type = 'environment'
LEFT JOIN _nango_environments environment
  ON environment.id = relation.entity_id
WHERE customer_keys.key_type = 'webhook_signing'
  AND customer_keys.deleted_at IS NULL
  AND environment.id IS NULL;
```

Release 2 has no migration. Creates stop writing the legacy row. Rotate upserts `webhook_signing_keys`, including the case where only the legacy row exists.

Release 3 adds the copy-if-newer, the delete, and the check constraint. It removes `scripts/one-off/rotate-webhook-signing-key/`. `packages/database/lib/renameDryrunApiKeyScope.integration.test.ts:99` inserts a `webhook_signing` row; that case goes away with the key type. `CustomerKeyType` in `packages/types/lib/environment/db.ts:83` stays `'api' | 'webhook_signing'` through release 3. The service still queries that value so a jobs replica is correct before the release 3 migration runs. Release 4 narrows it, after the legacy read is gone.

`rotateInDb` in `packages/shared/lib/services/customerKey.rotation.integration.test.ts:13` stands in for another process. In release 1 it writes only `customer_keys` and bumps `updated_at`, which is a pre-release-1 replica. In release 2 it writes only `webhook_signing_keys`.

## What deliberately does not change

- The HMAC header, webhook URLs, and which events send a webhook.
- Method names and return values on `customerKeyService`.
- The five-minute cache, and the rule that a read which already saw a later `updated_at` does not put an older secret back (`packages/shared/lib/services/customerKey.service.ts:395`).
- Dashboard redaction, both rotate routes, `environment:webhook_signing_key:rotate`, and the audit action `webhook_signing_key_rotated`.
- Soft-deleted environments keep their signing key (`packages/shared/lib/services/environment.service.ts:418`).
- API keys: `scopes`, relations, listing, caps, sandbox parent checks, and `grantsForKey`.
- `trg_env_delete_customer_key_relations` still deletes API keys on a hard environment delete (`packages/shared/lib/services/environment.service.ts:433` is the hard delete).

The legacy read stays through release 3. Deleting that query in the same deploy as the row delete brings back the jobs-before-migration window: jobs would ignore a newer legacy row the copy has not applied yet. Release 4 deletes the query only after release 3 is on every replica.

## Approach — and what we rejected

Serve the row with the later `updated_at`. Both tables already store that column from the database clock. A replica that has not been upgraded writes only the legacy row, so its write wins without a locked upsert and without a deploy-order dependency on the migration.

Rejected: legacy-first reads, then a locked upsert at the start of release 2, then delete on the following rolling deploy. The upsert has to finish before any jobs replica reads the new table first, and jobs do not run migrations. The delete runs when the first new server boots (`packages/server/lib/server.ts:82`), while release 2 replicas are still creating environments and rotating. Those creates insert `key_type = 'webhook_signing'` and fail the narrowed check. Those rotates lock a legacy row (`packages/shared/lib/services/customerKey.service.ts:456`) that the migration already removed and return 404.

Rejected: release 3 code that reads only `webhook_signing_keys`. Same jobs window, one release later.

Rejected: a down migration on release 3 that rebuilds `customer_keys.hashed`. Rollback to release 2 does not need the legacy rows; release 2 already serves a missing legacy row. `hashed` is not how signing keys are found. A previous migration has run `pbkdf2` from Node (`packages/database/lib/migrations/20240326141028_hash-key.cjs:4`). This plan does not need that.

Rejected: a new service module in these PRs. That is a mechanical move mixed with the behavior change.

### Seams

Tests call these and do not assert by selecting the ciphertext. Setup may insert one side, delete one side, or move `updated_at`. `storedKey` (`packages/shared/lib/services/customerKey.rotation.integration.test.ts:25`) and `signingKeyRow` (`packages/server/lib/controllers/v1/environment/postRotateWebhookSigningKey.integration.test.ts:11`) move to `getUncachedWebhookSigningKeyForEnv` in the first slice.

| Seam | Catches | Misses |
|---|---|---|
| `getWebhookSigningKeyForEnv` / `getUncachedWebhookSigningKeyForEnv` | Which row wins by `updated_at`, a missing side, cache versus a rotation committed elsewhere | HTTP status, HMAC bytes |
| `rotateWebhookSigningKey` then an uncached get | The secret both sides serve, 404 only when both rows are missing, 409, a later `updated_at` not overwritten by an earlier upsert | Audit row |
| Environment create, then get | A new environment is servable with only the new row (release 2) and with both (release 1) | The default API key |
| `hardDelete` then get | Cascade removes the secret | Soft delete, which must still serve it |
| Existing `POST` rotate test | Authz and the JSON body | Which table holds the ciphertext |

No webhook-delivery test. Hooks and jobs call `getWebhookSigningKeyForEnv`.

Each PR is one failing test, then the code that turns it green.

## The stack

| # | PR | What it does | ~diff | Deployable alone? |
|---|---|---|---|---|
| 1 | `feat(webhooks): dual-write webhook signing keys` | Table, copy with `updated_at`, write both rows under one timestamp, upsert only when newer, read the newer row | ~450 | Yes. Revert the code and drop the table. Legacy rows are still written. |
| 2 | `feat(webhooks): write webhook signing keys only to webhook_signing_keys` | Create writes the new row only. Rotate upserts it, including when only the legacy row exists | ~200 | Yes, after PR 1 is on every server and jobs replica. Revert the code and dual-write returns. No migration. |
| 3 | `feat(webhooks): remove webhook signing keys from customer_keys` | Copy the newest legacy row per environment, delete those rows, `key_type` is `api` only, remove the one-off script | ~250 | Yes, after PR 2 is on every replica. Revert is redeploying PR 2. `exports.down` is empty. |
| 4 | `feat(webhooks): read webhook signing keys only from webhook_signing_keys` | Drop the legacy read. Narrow `CustomerKeyType` to `'api'` | ~150 | Yes, after PR 3 is on every replica. The `customer_keys_relations` drop cannot ship until this is on every replica. |

Use `gh stack` so each PR sits on the one before it.

## Migration and deploy order

PR 1's migration runs on the first new server boot, possibly before jobs or every server replica is on the new code. That is safe: the copy preserves `updated_at`, and any later legacy-only write is newer. The `INSERT … SELECT` joins `_nango_environments`. `exports.down` drops `webhook_signing_keys`.

PR 2 has no migration. Do not start it until every server and jobs replica is on PR 1. A replica still on the old release reads only `customer_keys` and would miss a PR 2 rotation. Once that gate is met, jobs may roll before servers. A PR 1 replica reads the newer row, so a PR 2 rotation or create is visible immediately. A PR 1 rotate of an environment that only has the new row returns 404 for the length of this roll. PR 2 rotate of an environment that only has the legacy row inserts the new row instead of returning 404.

PR 3's migration runs on the first new server boot, possibly before jobs roll. Jobs on PR 3 still compare `updated_at`, so a legacy row the copy has not reached yet still wins. Then the migration copies those newer legacy rows, deletes them, and narrows the check. PR 2 replicas still in the roll do not write legacy rows, so the delete does not race a writer, and their reads find the new row. `exports.down` is empty.

PR 4 has no migration. Do not start it until every replica is on PR 3. Do not start the `customer_keys_relations` drop until every replica is on PR 4.

Soft delete during any release does not remove the signing key. Hard delete removes the new row by `ON DELETE CASCADE` and the legacy row by the existing trigger, until PR 3 has deleted the legacy row.

## Risks and the point of no return

PR 3's delete is not a one-way door for behavior. Redeploying PR 2 after it still reads the newer row, writes only the new table, and works with the legacy rows gone. There is no down migration.

The deploy that fails closed is PR 1, if any environment has two live signing keys or an orphaned relation. The queries above are the check. Run them before merging. PR 3 does not fail closed on a duplicate that appears later: `DISTINCT ON (environment_id) … ORDER BY updated_at DESC` keeps the newest legacy row. A duplicate between PR 1 and PR 3 can come from the one-off script racing a create. Without `DISTINCT ON`, `ON CONFLICT` errors with "cannot affect row a second time" and the deploy fails.

After PR 2, legacy signing rows are frozen with the old secret. Anything that updates `customer_keys` has to filter `key_type = 'api'`, as `customerKeysQuery`, `updateApiKeyScopes`, and `deleteCustomerKey` already do (`packages/shared/lib/services/customerKey.service.ts:81`, `packages/shared/lib/services/customerKey.service.ts:537`, `packages/shared/lib/services/customerKey.service.ts:560`). An unfiltered `SET updated_at = now()` makes that frozen secret look newer. Reads would serve it, and the PR 3 copy would write it over the rotated secret. The grants migration has to keep that filter.

The cache can serve the previous secret for up to five minutes after another replica rotates. That is current behavior. The two writes must share the timestamp returned by the legacy `clock_timestamp()`, and the copy must keep the source `updated_at`. If those drift, the cache can keep a stamp from one row while the read served the other.

A pre-release-1 replica still in the PR 2 roll signs with the legacy secret and ignores the new table. The gate on PR 2 is what prevents that. The gate is the whole fleet, jobs included, not "the server deploy finished."

## Open questions

Seams in the table above are the TDD gate. No test is written at another seam unless that list changes.

## Appendix — per PR

### PR 1: feat(webhooks): dual-write webhook signing keys

Files: new migration, `packages/shared/lib/services/customerKey.service.ts`, `packages/shared/lib/services/customerKey.rotation.integration.test.ts`. The HTTP rotate test drops `signingKeyRow` and asserts `getUncachedWebhookSigningKeyForEnv`.

Slices:

1. Point the overlapping-rotate assertion at `getUncachedWebhookSigningKeyForEnv`. Behavior is unchanged, so this stays green.
2. Red: the legacy row is newer and its plaintext differs from `webhook_signing_keys`. Get returns the legacy plaintext. Green: compare `updated_at`.
3. Red: the new row is newer and differs. Get returns that plaintext. Green: same comparison.
4. Red: only the new row exists. Get returns it. Green: a missing side is the other row. This is not a release 1 production path. Release 2 creates take it while release 1 replicas are still reading, so the code has to ship here.
5. Red: after `rotateWebhookSigningKey`, the two rows' `updated_at` values are equal. This is a direct read of those two timestamps, which the other slices do not do. Moving the new row's timestamp in setup cannot see whether the write stored one value or two. Green: the new row stores the `updated_at` the legacy update returned.
6. Red: hold the new row's lock, let rotate update the legacy row and block on the upsert, then commit a later secret on the new row and release the lock. Uncached get returns that later secret. Green: `ON CONFLICT … DO UPDATE … WHERE webhook_signing_keys.updated_at < EXCLUDED.updated_at`.
7. The existing "rotated elsewhere" test stays, with `rotateInDb` writing only the legacy row and bumping its `updated_at`. Uncached get returns that secret. Cached get keeps the previous one.

`exports.down` drops the new table. Integration tests: `npm run test:integration -- packages/shared/lib/services/customerKey.rotation.integration.test.ts` and `packages/server/lib/controllers/v1/environment/postRotateWebhookSigningKey.integration.test.ts`.

### PR 2: feat(webhooks): write webhook signing keys only to webhook_signing_keys

No migration. Files: the service, and `rotateInDb`.

Slices:

1. Red: `rotateWebhookSigningKey` with no legacy row returns a secret, and the uncached get returns it. Green: rotate writes `webhook_signing_keys` and does not require the legacy row.
2. Red: only a legacy row exists, rotate returns a new secret, and the uncached get returns it. Green: rotate inserts the new row when it is missing. 404 remains the result only when both rows are missing.
3. Red: environment create, legacy signing row absent, uncached get returns a secret. Green: create inserts only the new row.
4. Red: `rotateInDb` writes only the new table with a later `updated_at`. Uncached get returns it. Cached get keeps the previous secret. Green: point the helper at `webhook_signing_keys`.

Slice 2 from PR 1 stays green. A legacy-only write with a later `updated_at` still wins, which is a release 1 replica or the one-off script during this roll.

Deploy gate: every `packages/server` and `packages/jobs` replica on PR 1.

### PR 3: feat(webhooks): remove webhook signing keys from customer_keys

Files: migration, delete `scripts/one-off/rotate-webhook-signing-key/`, drop the non-API case in `packages/database/lib/renameDryrunApiKeyScope.integration.test.ts`. The service keeps the newer-row read.

The migration:

1. Upsert into `webhook_signing_keys` from live legacy rows, `DISTINCT ON (environment_id) ORDER BY updated_at DESC`, and only where that row is newer or the new row is missing. Preserve `updated_at`. Join `_nango_environments`.
2. Delete `customer_keys` rows with `key_type = 'webhook_signing'`. Relations follow `ON DELETE CASCADE` from `customer_key_id`.
3. Add `check_customer_keys_key_type` for `'api'` as `NOT VALID`, then `VALIDATE CONSTRAINT`. That avoids holding `ACCESS EXCLUSIVE` on `customer_keys` for the whole scan. API-key auth reads this table on every request.

`exports.down` is empty. No new behavioral slice: PR 2 already serves a missing legacy row, and this migration makes every legacy row missing. The regression test is the PR 2 suite, plus `hardDelete` then get returns `no_webhook_signing_key`, and soft delete then get still returns the secret. Hard delete is already cascade from PR 1; the test lands here because this is the release where the trigger no longer sees a signing key.

Deploy gate: every server and jobs replica on PR 2.

### PR 4: feat(webhooks): read webhook signing keys only from webhook_signing_keys

Files: `packages/shared/lib/services/customerKey.service.ts`, `packages/types/lib/environment/db.ts`. No migration.

No new failing behavior. After release 3, production has no legacy signing row, and PR 2 already serves that case. This PR deletes the legacy query and narrows `CustomerKeyType` to `'api'`. The PR 2 suite stays green, including get with only `webhook_signing_keys` populated.

Deploy gate: every server and jobs replica on PR 3. The drop of `customer_keys_relations` is a later project and waits until this deploy has finished on every replica.
