# Auto-deploy catalog actions on integration create

`.deep-plan/` can be gitignored; this file is a working plan, not a commit.

## The problem

A newly created integration has zero deployed functions. Catalog actions exist for that provider in `flows.zero.json`, but they are not callable until someone deploys each one through `POST /api/v1/flows/pre-built/deploy`. The dashboard, public API, MCP `integrations_create`, and playground all see an empty function list until that happens.

The goal: every catalog **action** for the provider is deployed (and enabled) as soon as the integration exists, so the integration is immediately usable. Syncs stay opt-in — they auto-start against existing connections and hit billing.

## Today

Creating an integration writes a `_nango_configs` row and returns. Dashboard create (`packages/webapp/src/pages/Integrations/Create.tsx:32`) posts to `postIntegration` (`packages/server/lib/controllers/v1/integrations/postIntegration.ts:12`) and navigates to settings. Public API, MCP, and quickstart go through `integrationService.create` (`packages/server/lib/services/integration.service.ts:242`). Both paths end in `configService.createProviderConfig` (`packages/shared/lib/services/config.service.ts:144`). Neither path deploys anything.

Deploying a catalog template is a one-at-a-time operation:

1. UI or MCP calls `deployIntegrationTemplate` (`packages/server/lib/services/integrationTemplate.service.ts:29`).
2. That looks the template up in `flowService`, then calls `deployTemplate` (`packages/shared/lib/services/deploy/template.ts:27`).
3. `deployTemplate` copies the compiled JS and the TS source from the public catalog prefix into the account's S3 prefix (`packages/shared/lib/services/file/remote.service.ts:120`), then inserts one `_nango_sync_configs` row with `source: 'catalog'` and `enabled: true`.
4. `triggerIfConnectionsExist` then runs — and **skips actions** (`packages/shared/lib/services/sync/manager.service.ts:515`). Deploying an action is a no-op for existing connections.

The Functions tab already deploys a single action with one click and only confirms for syncs (`packages/webapp/src/pages/Integrations/providerConfigKey/Functions/Tab.tsx:287`). Looping that from the client after create would miss every non-dashboard create path and would time out on large catalogs.

Scale of the catalog (from `packages/shared/flows.zero.json`): 195 of 218 providers have actions; median 26, p90 59, Shopify 133. Each current deploy is two S3 copies plus a DB transaction plus its own log context. A naive loop of `deployIntegrationTemplate` on Shopify create is ~266 sequential copies.

Custom (CLI) deploy already batches: `DEPLOY_BATCH_SIZE` (default 5) of parallel file uploads, then one transaction for all `_nango_sync_configs` + endpoints (`packages/shared/lib/services/sync/config/deploy.service.ts:120`). Catalog deploy never got that treatment.

## After

Creating an integration still returns the integration as it does today. As part of that same server-side create, the server bulk-deploys every catalog action for the provider:

- Resolve the provider's actions from `flowService.getAllAvailableFlowsAsStandardConfig()`.
- Skip names already present as an active `_nango_sync_configs` row (idempotent; also covers a retry after a partial failure).
- Copy JS+TS for the remaining actions in parallel (same copy primitive as today, so version pinning and explicit upgrade stay intact).
- Insert all `_nango_sync_configs` + endpoints in one transaction, `type: 'action'`, `source: 'catalog'`, `enabled: true`.
- One deploy log context for the batch, not one per action.
- Do **not** call `triggerIfConnectionsExist` (no-op for actions anyway).
- Do **not** deploy syncs or on-events.

If the plan is auto-idled with an expired trial, skip auto-deploy the same way a single pre-built deploy is blocked today (`packages/server/lib/services/integrationTemplate.service.ts:51`). Integration create still succeeds.

If some copies fail, the integration still exists. Successfully copied actions are committed; failed names are left undeployed and can be added from the Functions tab (or a retry). Create does not roll back.

After this, opening the Functions tab on a fresh Shopify integration shows 133 enabled catalog actions and only the sync templates as "add from catalog". Playground, MCP tools, and `POST /action/trigger` can invoke them without a prior deploy click.

## What will look different in the codebase

- New `deployCatalogActions({ environment, account, plan, integration })` in `packages/server/lib/services/integrationTemplate.service.ts` (or a sibling). Reuses `deployTemplate`'s copy + row shape, but batched. Single-template `deployIntegrationTemplate` stays for the Plus button / MCP `functions_deploy_template`.
- `packages/shared/lib/services/deploy/template.ts` gains a bulk variant (or `deployTemplate` is parameterized to accept `NangoSyncConfig[]`). Parallel `remoteFileService.copy`, then one knex transaction for configs + endpoints.
- Both create paths call the bulk function after a successful insert:
  - `integrationService.create` (`packages/server/lib/services/integration.service.ts:337`) — public API, MCP, quickstart.
  - `postIntegration` (`packages/server/lib/controllers/v1/integrations/postIntegration.ts:125`) — dashboard. This path does not go through `integrationService.create`.
- Plan lookup: `integrationService.create` today has no `plan`/`account`. The bulk function should load those from `environment.id` rather than threading them through every caller, so a missed caller cannot skip the trial check by accident.
- Functions tab: undeployed **action** templates disappear from the mixed list for a freshly created integration (they are deployed). Sync templates unchanged. Empty-state copy still applies to providers with zero catalog actions (23 today).
- Tests: extend `postDeploy.integration.test.ts` with a bulk case; add an integration-create test that asserts every catalog action for a small provider (e.g. one with a handful of actions) is present and enabled; assert Shopify-scale is not required in CI — unit-test the batching with a stubbed `copy`.

## What deliberately does not change

- Syncs and on-events are not auto-deployed.
- Catalog file layout and upgrade (`upgradeTemplate`) stay copy-into-account-prefix. We do not point `file_location` at the public `templates-zero/` object.
- Single-template deploy API, MCP `functions_deploy_template`, and the Plus button remain.
- Action invocation, enable/disable, and billing (function executions on run, not on deploy) stay as they are.
- Existing integrations are not backfilled in this stack (open question below).
- The two create implementations are not unified in this stack; they only share the new hook.

## Approach — and what we rejected

**Do it server-side, in bulk, as part of create.** Actions have no connection-side effect on deploy, so the only costs are S3 copies, DB rows, and create latency.

Rejected:

- **Client loop of `usePreBuiltDeployFlow` after dashboard create.** Misses public API / MCP / quickstart; 133 serial POSTs; easy to ship a dashboard-only bug.
- **Loop `deployIntegrationTemplate` on the server.** Correct layer, wrong granularity. One log context, two copies, and one transaction per action.
- **Point `file_location` at the public catalog object and skip the copy.** Attractive (bulk deploy becomes an INSERT) but it changes upgrade semantics: public paths are unversioned (`templates-zero/{provider}/build/{provider}_actions_{name}.cjs`), so a catalog publish would mutate every "deployed" action in place. Today copy pins a snapshot and upgrade is explicit. Do not mix that into this change.
- **Background job / fire-and-forget.** No existing deploy queue. Median 26 actions is fine awaited if copies are parallel; Shopify is the outlier. Start awaited; promote to a job only if p99 create latency is a problem.
- **Virtual / lazy deploy on first invoke.** Bigger execution-path change (`jobs` loads `file_location` from the sync config). Right long-term if we ever want "catalog actions exist without a row", not required to meet "deployed as soon as created".

## The stack

| # | PR | What it does | ~diff | Deployable alone? |
|---|---|---|---|---|
| 1 | Bulk catalog-action deploy | `deployCatalogActions` + batched `deployTemplate`s. Callable internally; add a thin internal-only test surface. No create hook yet. | ~300 | Yes — unused in prod until PR 2, but tested. Prefer exposing it from the existing pre-built deploy controller as an optional `scriptName` omitted / `type: 'action'` bulk, **or** keep it unexported and test via the service. Unexported is enough if PR 2 follows immediately. |
| 2 | Hook both create paths | Call `deployCatalogActions` after successful create. Skip on expired trial. Create succeeds even if deploy is partial. | ~150 | Yes — this is the behavior change. |
| 3 | Functions tab empty-state | No product logic change if PR 2 is live; verify the mixed list and empty card still make sense when all actions are already deployed. Small copy tweaks only if needed. | ~50 | Yes |

PR 1 is scaffolding if it ships without PR 2. Merge them as a two-PR stack in one review cycle, not weeks apart.

## Migration and deploy order

- Nothing in flight: create is not currently followed by deploys.
- Old and new coexist: integrations created before this still have undeployed actions; the Plus button still works.
- No schema change, no backfill in this stack.
- Revert of PR 2 stops auto-deploy on *new* creates. Already-deployed actions stay; that is the same as a user having clicked Plus.
- No flag unless we want a kill switch for Shopify-scale S3 load. A server env flag (`AUTO_DEPLOY_CATALOG_ACTIONS=true`) is cheap insurance for the first deploy; default on in the PR, easy to flip off.

Point of no return: none. S3 objects and `_nango_sync_configs` rows are the same artifacts a manual deploy writes.

## Risks

- **Create latency.** Parallel copies of 133×2 objects in one bucket should be seconds, not tens of seconds, but it is the thing to measure on staging with Shopify before flipping on in prod. If it is worse, drop await and run the same function without blocking the HTTP response (same process, log failures). That is a one-line change to the hook, not a new architecture.
- **S3 object growth.** Every new Shopify integration adds ~266 objects that duplicate catalog bytes. That is already true per manual deploy; this just makes it the default. Acceptable given we are keeping pin-on-deploy.
- **Partial failure.** User sees some actions, not all. Functions tab still lists the missing ones as catalog rows. Retry of create is impossible (unique_key taken); retry has to be "deploy remaining" — which is the existing Plus button, or a follow-up "deploy missing catalog actions" that reuses `deployCatalogActions` (already idempotent).
- **Trial / auto-idle.** Skipping auto-deploy on expired trial means free-plan-after-idle integrations still look empty. Same as today when they try to click Plus.
- **Name collisions.** `deployTemplate` already errors if an active catalog config exists for that name. Bulk skips those. A *custom* function with the same name as a catalog action: `getSyncAndActionConfigsBySyncNameAndConfigId` will find it. Decide in PR 1: skip (do not overwrite custom) rather than replace. Custom wins.

## Open questions

1. **Existing integrations.** Backfill or leave them? A one-off job that calls `deployCatalogActions` per integration is straightforward and restartable. I would not block create-path work on it.
2. **Enabled vs deployed-disabled.** Today a template deploy is `enabled: true`. Auto-deploying 133 enabled actions does not schedule work (actions have no `runs`). I would keep `enabled: true` so they are callable immediately. If the concern is "I did not ask for these", disable is the wrong lever — they should not be deployed at all.
3. **Create waits vs returns immediately.** I would wait, with parallel copies. If dashboard create on Shopify feels slow, switch the hook to not await without changing deploy itself.
4. **Unify the two create paths.** Worth doing, not required. Dual-hook is the smaller change.

## Appendix — per PR

### PR 1: feat(server): bulk-deploy catalog actions

- Add `deployCatalogActions` next to `deployIntegrationTemplate`.
- Extract the copy+insert body of `deployTemplate` so one vs many share it.
- Parallelism: `Promise.all` over copies with a concurrency cap (reuse `DEPLOY_BATCH_SIZE` or a slightly higher copy-only cap; copies are cheaper than CLI compiles).
- One log context `deploy:prebuilt` listing every name.
- Skip `template_already_deployed` / custom-name clashes rather than failing the batch.
- Tests with stubbed `remoteFileService.copy`: empty catalog, mixed already-deployed, one copy failure does not abort the rest, custom name is skipped.

### PR 2: feat(server): auto-deploy catalog actions on integration create

- After `createProviderConfig` succeeds in both `integrationService.create` and `postIntegration`, call `deployCatalogActions`.
- Load plan/account from the environment; skip on expired `auto_idle` trial; start trial if that is what single deploy does today (`!plan.trial_end_at && plan.auto_idle`).
- Errors from the bulk deploy are logged, not returned to the client. Create response shape unchanged.
- Integration tests on both create endpoints with a small provider.

### PR 3: chore(webapp): functions tab after auto-deployed actions

- Manual / Playwright pass: create a provider with actions, Functions tab shows them enabled, sync templates still have Plus, empty card only when the provider has no catalog at all.
- Copy changes only if the empty card is now misleading.
