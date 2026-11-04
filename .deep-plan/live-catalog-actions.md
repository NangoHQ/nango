# Live catalog actions

`.deep-plan/` can be gitignored; this is a working plan, not a commit. It replaces the rejected copy-on-create approach in `.deep-plan/auto-deploy-catalog-actions.md`.

## The problem

A newly created integration has zero callable actions. Catalog actions exist in `packages/shared/flows.zero.json` and as compiled JS under `templates-zero/`, but MCP, the playground, and `POST /action/trigger` only see rows in `_nango_sync_configs`. Until someone deploys each template via `POST /api/v1/flows/pre-built/deploy`, the integration looks empty.

Copying every catalog action into the account S3 prefix on create was rejected: Shopify is ~133 actions × two files, and a pinned row cannot auto-update.

The goal: catalog **actions** are live on an integration without a per-action deploy, auto-update when Nango ships a new catalog, can be disabled one at a time, and can be detached with `nango pull` + `nango deploy`. Syncs stay on today's enable/deploy path.

## Today

Creating an integration writes `_nango_configs` and returns. Dashboard create (`packages/webapp/src/pages/Integrations/Create.tsx:32`) posts to `postIntegration` (`packages/server/lib/controllers/v1/integrations/postIntegration.ts:12`). Public API, MCP `integrations_create`, and quickstart go through `integrationService.create` (`packages/server/lib/services/integration.service.ts:242`). Shared-credentials creates go through `createPreprovisionedProvider` (`packages/shared/lib/services/shared-credentials.service.ts:73`). None of those paths deploy functions.

A catalog template becomes runnable only after `deployTemplate` (`packages/shared/lib/services/deploy/template.ts:27`) copies JS+TS from `templates-zero/` (`packages/shared/lib/services/file/remote.service.ts:56`) into the account prefix and inserts `_nango_sync_configs` with `source: 'catalog'`. That enum value is **ownership of a pinned copy**, not a live pointer (`packages/types/lib/syncConfigs/db.ts:8`).

Listing and invocation both require that row:

- `listFunctions` reads `_nango_sync_configs` + on-event (`packages/shared/lib/services/functions/legacy/service.ts:27`).
- Agent MCP toolset compiles from `findIntegrationFunctionCatalog`, a left join onto the same table (`packages/server/lib/services/agentSessionToolset.service.ts:89`). An integration with no rows contributes no tools.
- `executeAction` looks up `getSyncConfigRaw` and returns `unknown_action` when missing (`packages/server/lib/services/action.service.ts:75`). Jobs do the same lookup (`packages/jobs/lib/execution/action.ts:77`) and then `startScript` reads `nangoProps.syncConfig.file_location` (`packages/jobs/lib/execution/operations/start.ts:40`).
- Deprecated HTTP `/v1` resolves actions via `_nango_sync_endpoints` (`packages/shared/lib/services/sync/config/endpoint.service.ts:15`).
- `getCode` (used by `nango pull --env`) 404s when there is no row (`packages/server/lib/controllers/shared/integrations/functions/getCode.ts:61`).

The Functions tab treats "no `id`" as "not deployed yet" and calls pre-built deploy (`packages/webapp/src/pages/Integrations/components/FunctionSwitch.tsx:83`). Source badges collapse everything that is not `repo` into "Nango" (`packages/webapp/src/pages/Integrations/providerConfigKey/Functions/Tab.tsx:228`).

`deployTemplate` only 409s if a **`source: 'catalog'`** row already exists (`packages/shared/lib/services/deploy/template.ts:48`). A repo or standalone row for the same name does not block a catalog pin — an API hole the UI already avoids via `findActiveDeployedMeta`.

Repo deploy inactivates any other active row for that name (`packages/shared/lib/services/sync/config/deploy.service.ts:326`). Delete of the repo row (`packages/server/lib/tasks/startFunctionDeletion.ts:20`) does not reactivate the inactivated standalone, so today's stack already drops JIT on detach.

Sync enable still creates `_nango_syncs` + schedules. `triggerIfConnectionsExist` skips actions (`packages/shared/lib/services/sync/manager.service.ts:515`). That is why this change is actions-only.

## After

An integration has a boolean **`auto_enable_catalog_actions`** on `_nango_configs`. New creates default it **on**. Existing integrations keep it **off** (column default `false`; no backfill).

**The only way to turn every catalog action on at once is to set the flag at create.** PATCH `auto_enable_catalog_actions: true` on an existing integration — empty, partially enabled, or fully denied — never enables the current catalog. It only starts auto-adding names that appear in the catalog **after** that PATCH.

The flag is the **default for names absent from the overlay map**, and therefore auto-add of future names. It is not a lock. Catalog actions are always individually enableable and disableable. `false` does not mean “this integration cannot use the catalog.”

When a catalog action is **on**, it is in the function list, in the agent toolset, and callable — with no `_nango_sync_configs` row and no S3 copy. JS is read from `templates-zero/{provider}/build/{provider}_actions_{name}.cjs`. Input/output schemas, endpoints, `sdk_version`, and `features` come from `flows.zero.json` at call time, so a catalog ship updates every live-on action without a deploy.

A name that already has an **active** `_nango_sync_configs` row is owned. The live catalog does not overlay it. Owned rows keep today's `source: 'catalog' | 'standalone' | 'repo'`. Live catalog is **not** a `FunctionSource` and is never written to that column.

### Membership

Two columns on `_nango_configs`, loaded with the integration row we already have (list, invoke, MCP toolset, jobs):

- `auto_enable_catalog_actions boolean NOT NULL DEFAULT false`
- `catalog_action_overrides jsonb NOT NULL DEFAULT '{}'` — a **map** `{ [name: string]: boolean }`, not an array. Object keys are uniqueness. Never store this on `custom` (credentials/provider config).

A key in the map is an absolute override. The flag is only the default for names that are not in the map:

```
if owned active _nango_sync_configs row: that row (live catalog does not apply)
else if name in catalog_action_overrides: catalog_action_overrides[name]
else: auto_enable_catalog_actions
```

That is the usual override rule. Presence-only (`live = flag XOR key present`) is equivalent in steady state, because we only store exceptions so each value is always `!flag`. We keep the boolean on each key anyway: every list/invoke/toggle path can ignore the XOR and read the value. Worst case today is Shopify-scale (~133–200 keys) — a few KB, not a join.

Do not use a separate overlay table. Membership is always per integration; every caller already has `_nango_configs`. `findIntegrationFunctionCatalog` (agent toolset) would otherwise join another table for every integration in the environment.

| | Flag on, key absent | `{name: false}` | Flag off, key absent | `{name: true}` |
| --- | --- | --- | --- | --- |
| Live? | on | off | off | on |

Toggle writes the **desired** state, then drops the key if it matches the default (map stays exception-only). Update the JSON on the config row with `jsonb_set` / `-` (or lock the row and rewrite): two concurrent enables of different names must not clobber each other.

- Disable → set `overrides[name] = false`; delete the key if the flag is already false.
- Enable → set `overrides[name] = true`; delete the key if the flag is already true.

Do not leave `overrides[name] === flag` keys around; they are noise. Resolve would still be correct if one slipped in (the map value wins).

`listFunctions` (the runnable list) unions only **on** live actions. Disabled catalog names are not tools; they remain enableable from Templates (and from the enable-by-name API). Do not hide the catalog when the flag is off. Do not put the overlay blob on the public integration API; list/get-function already return `enabled`.

#### Create vs PATCH

PATCH still **replaces the overlay map with the catalog complement** (minus owned), then flips the flag. Each remaining key gets `enabled` equal to that name's **unchanged** live state — which is `!newFlag`. One `UPDATE` of the two columns; no child-table insert.

Same five names: `{list, create, update, delete, search}`. Complement of `{delete, search}` is `{list, create, update}`.

| Event | Overlay writes | Current catalog | Future catalog names |
| --- | --- | --- | --- |
| Create, flag `true` | none | all **on** | **on** |
| Create, flag `false` | none | all **off** | **off** until explicitly enabled |
| PATCH `false` → `true` | map := catalog − owned − old keys, each value `false` | **unchanged** — empty map becomes every current name, all still off | **on** from this moment |
| PATCH `true` → `false` | map := catalog − owned − old keys, each value `true` | **unchanged** — empty map becomes every current name, all still on (frozen) | **off** from this moment |

PATCH runs in one transaction with the flag update. Catalog size is bounded (Shopify ~133 keys); rewriting the JSONB is fine.

Worked examples (five actions: `list`, `create`, `update`, `delete`, `search`):

- **Create checked** → flag true, overlay `{}` → all five on. Disable `delete` and `search` → `{delete: false, search: false}`. PATCH flag off → `{list: true, create: true, update: true}`. Those three stay on; `delete`/`search` stay off. A later `export` stays **off**.
- **Create unchecked** → flag false, overlay `{}` → all five off. Enable `list` and `create` → `{list: true, create: true}`. PATCH flag on → `{update: false, delete: false, search: false}`. `list`/`create` stay on; the rest stay off. A later `export` comes **on**.
- **Existing integration** (flag false, overlay `{}`). PATCH true → every current catalog name at `false`. Still 0 on. Only names added to the catalog after that PATCH appear. There is no API to “enable all current” after create.
- **Create checked, then PATCH false** with nothing disabled → every current name at `true`. Frozen set, live JS. New catalog names stay off.

Flipping the flag **without** replacing the map is still wrong for names with **no** key (the default blasts). Keys already in the map keep their boolean, which is better than XOR inversion but not a substitute for conversion. Tests must cover convert-then-flag; a flag UPDATE alone is not the public PATCH.

### Precedence

Higher overlays lower **on deploy**. Deleting the overlay does not write the lower layer — the lower layer **resurfaces**.

1. Live catalog (no owned row; on/off from flag default or `catalog_action_overrides[name]`)
2. Nango — `source: 'standalone'` **or** pinned `source: 'catalog'`
3. Your repo — `source: 'repo'`

Worked example: catalog `create-contact` is visible → `nango pull` + `nango deploy` → repo visible → delete the repo function → catalog visible again.

A disabled owned row still overlays live catalog (`executeAction` already returns `disabled_action` for `enabled: false`). Disable of a live action writes a key on the config overlay; it does not insert a sync config.

Repo deploy still inactivates the previous active row. On delete of the active owned row, we **reactivate** the most recently updated inactive, non-deleted row for that `(nango_config_id, name, type)` if one exists. If none exists, live catalog resurfaces. That is the missing step that makes "repo over JIT, delete repo → JIT" true; live catalog itself needs no reactivation.

Catalog / template deploy 409s when any active owned row exists for that name, not only `source: 'catalog'`. It also 409s when the name is already served live (no pin-to-disable-auto-update from the Plus button). The Templates page treats live actions as already deployed, so Deploy is hidden.

### Listing and API shape

List items are `ListedNangoFunction` (`NangoFunction` & `FunctionAvailability`) after PR 1's rename. For a live action:

- `id: null` — there is no sync config. `FunctionSwitch` stops using "no id" as "please copy-deploy".
- `source: 'nango-catalog'` — API-only. Not added to the DB `FunctionSource` enum.
- `enabled`: from the membership rule above (`catalog_action_overrides[name]` if present, otherwise the flag).
- `json_schema`, `input`, `returns`, `description`, `scopes`: from `flowService` / the shared catalog reader, never snapshotted.
- `last_deployed: null` — there was no deploy.

The JSON wire does not use these TypeScript names. Template responses keep the field `deployed` (meaning “has an owned row”). Do not rename that key.

UI badges: `nango-catalog` → **Catalog**; `repo` → **Your repo**; `standalone` and pinned `catalog` → **Nango**.

Detail page (`Functions/One.tsx`): live actions have no Delete (nothing to delete; disable instead), no compiled-JS download (no `id`), pull snippet uses `--env` and `getCode` returns catalog TS, GitHub "View code" stays.

### Invoke

`resolveRunnableAction({ environmentId, config, name })` in shared:

1. Active `_nango_sync_configs` row for that action name → that row (enabled or not).
2. Else, if the name is a live catalog member → a synthetic `DBSyncConfig` used only in memory:
   - `file_location = templates-zero/{provider}/build/{provider}_actions_{name}.cjs`
   - `models_json_schema`, `sdk_version`, `features` from the catalog reader
   - `id: 0` (logs already treat a missing `syncConfig.id` as optional; do not emit `0` to Elasticsearch — pass `{ name }` only)
3. Else → not found.

`startScript`: if `file_location` starts with `templates-zero/`, always `remoteFileService.getFile`, including locally. Copied files keep today's cloud-vs-local split.

`getActionOrModelByEndpoint` falls through to catalog action endpoints when no `_nango_sync_endpoints` row matches and the action would be live+enabled. Deprecated `/v1` keeps working.

`getCode` / `nango pull --env`: same fallback, TS from `templates-zero/{provider}/actions/{name}.ts`. Owned name still wins. `nango pull --catalog` is unchanged.

### What the runner never does

It never writes a `_nango_sync_configs` row for a live action. It never copies S3. A catalog ship is visible on the next list and the next run.

## What will look different in the codebase

- TypeScript list types (PR 1): `DeployedMeta` → `FunctionAvailability`, `DeployedNangoFunction` → `ListedNangoFunction` (and the sync/action/on-event variants). JSON keys unchanged. Template JSON keeps `deployed`.
- Migration in `packages/database/lib/migrations/`: on `_nango_configs`, `auto_enable_catalog_actions boolean NOT NULL DEFAULT false` and `catalog_action_overrides jsonb NOT NULL DEFAULT '{}'`. Follow recent `_nango_configs` ALTER style (`packages/database/lib/migrations/20250604140535_add_webhook_forwarding_enabled.cjs:5`).
- `IntegrationConfig` grows both columns. Create bodies accept `auto_enable_catalog_actions`; omit → `true` on **new** creates only. Do not accept a client-supplied overlay blob. `ApiIntegration` may expose the flag for settings; not the map.
- Shared catalog reader `packages/shared/lib/services/catalog/actions.ts` (name flexible): lookup by provider + action name from `flows.zero.json`. Jobs cannot import `packages/server/lib/services/flow.service.ts`; the JSON already lives in shared. `flow.service.ts` can keep building the full template list for the dashboard and call this for the per-action shape.
- `resolveRunnableAction` + membership helper in shared; used by `executeAction`, jobs `startAction`, `getActionOrModelByEndpoint`, `getCode`.
- `listFunctions` / `getFunction` / `findIntegrationFunctionCatalog` / `findActionInputSchemas` / `findActiveFunctionAvailability` union live catalog actions. Pagination: merge owned + live in memory then slice. Catalog per provider is bounded (Shopify ~133); do not SQL-union `flows.zero.json`.
- New dashboard + public PATCH: enable/disable a live action by `{ providerConfigKey, name, type: 'action' }` (`jsonb_set` / delete key as in Membership). Today's `PATCH /flows/:id/enable` stays for owned rows. PATCH integration `auto_enable_catalog_actions` rewrites the map in the same `UPDATE` — never “enable all current.”
- `FunctionSwitch` and `Functions/Tab.tsx` / `Functions/One.tsx` as above. Create page checkbox, default on, above the auth form in `Create.tsx` so it is not duplicated across `AuthCreateForm` variants.
- `deployTemplate` 409 when any active owned row exists, or when the name is already live.
- `startFunctionDeletion` (or the transaction that soft-deletes) reactivates the next inactive owned row for that name.
- `startScript` special-cases the `templates-zero/` prefix.
- Docs: `docs/guides/functions/functions-guide.mdx` Option 1 becomes "catalog actions are on at create" rather than "enable a template". Detach remains `nango pull` + `nango deploy`.

## What deliberately does not change

- Syncs and on-events. No live catalog, no auto-enable, no overlay. Templates page + enable/deploy stay.
- Existing `_nango_sync_configs` rows. No backfill, no rewrite of `source: 'catalog'` into a live pointer, no S3 cleanup of already-copied files.
- `FunctionSource` DB enum. `'nango-catalog'` is list/API only.
- `function_configs` / experimental `POST /functions/deployments` / `POST /functions/invocations`. Still `source: 'repo'` on that table; standalone on `_nango_sync_configs` is the JIT layer this plan talks about.
- CLI `nango deploy` (legacy `/sync/deploy` and functions bundle). Repo still inactivates other active rows.
- `nango pull --catalog` (GitHub). `--env` gains a live fallback; it does not change catalog pull.
- Trial / auto-idle: `executeAction` does not check `plan_limit` today; live catalog does not add a new gate. Enabling an owned script still does (`packages/server/lib/controllers/v1/flows/id/patchEnable.ts:51`). Listing live tools on an expired trial is allowed; billing is execution.
- Copy-on-pin `deployTemplate` for **syncs** only. Catalog **actions** are never copy-deployed to enable them: Templates Enable writes overlay membership (live JS) whether the flag is on or off.
- JSON field names on list/template responses (`deployed` on templates still means “has an owned row”). TypeScript names change in PR 1; the wire does not.
- Records, schedules, webhooks, connection creation.

## Approach — and what we rejected

**Live catalog (this plan).** JS and definitions both resolved at run/list time. Auto-update is free. Disable is an overlay, not a row that `getSyncConfigRaw` would try to execute.

Rejected:

- **Bulk S3 copy on create** (`.deep-plan/auto-deploy-catalog-actions.md`). Pins every action; cannot auto-update; Shopify ~266 copies.
- **Pointer rows with `source: 'catalog'` and `file_location` pointing at public S3.** Still one row per action, still snapshots `models_json_schema`, overloads the ownership enum, and `getSyncConfigRaw` would treat them as owned. The next catalog ship would not update schemas.
- **JSON overlay on `_nango_configs.custom`.** `custom` is provider credentials/config; membership is not a credential. A dedicated `catalog_action_overrides` column is the right place.
- **A separate `catalog_action_overrides` table.** Membership is always per integration and we already load `_nango_configs`. The join is extra on every list/MCP path; Shopify-scale maps are small enough for JSONB. Revisit a table only if overlays are written from many workers at once or queried by action name across tenants.
- **`function_configs` as the overlay.** That table is versioned experimental deploys.
- **Rowless live syncs.** Enabling a sync is a schedule, not a flag. Out of scope.
- **Migrating pinned catalog rows to live.** Existing copies stay; deleting one is how that name returns to live.
- **Default-on for existing integrations.** Turning the column default to `true` would drop ~26–133 new tools onto every undeployed GitHub/Shopify/etc. integration the day this ships. Existing stay quiet.
- **PATCH true as “opt this integration into the catalog.”** Under the create-vs-PATCH rule, PATCH true on an empty integration writes every current catalog name into the overlay (all still off). There is no `enable_all_current`. Recreate (or create with the checkbox) is the only bulk-on.
- **Presence-only overlay** (`live = flag XOR key present`). Equivalent if we only store exceptions, but every list/invoke/toggle path has to remember the XOR. Map values are the usual override rule; the complement on PATCH is the one clever write.
- **Renaming list types in the same PR as live catalog.** Mechanical grep mixed with invoke/membership hides the behavior. Rename first.

## The stack

| # | PR | What it does | ~diff | Deployable alone? |
| --- | --- | --- | --- | --- |
| 1 | `refactor(functions): rename DeployedNangoFunction to ListedNangoFunction` | Mechanical rename of list/availability types. No behavior. | 200–400 | Yes. Names match “functions on this integration” before any of them are live-without-deploy. |
| 2 | `feat(functions): run and list live catalog actions` | Schema (flag + JSONB map on `_nango_configs`), catalog reader, resolve, invoke, list, MCP toolset, new creates default the flag on | 600–900 | Yes. Existing integrations unchanged. New creates get live actions with no UI for disable yet (wait for PR 3). |
| 3 | `feat(functions): catalog action membership and dashboard` | Overlay API, FunctionSwitch, create checkbox, PATCH flag conversion (never bulk-on), source badge, detail page | 400–600 | Yes. Without it, PR 2's new integrations cannot turn a single action off from the UI. |
| 4 | `feat(functions): catalog overlay precedence and detach` | Template 409, delete-owned reactivates next layer, pull `--env` already works from PR 2, docs | 200–350 | Yes. Without it, repo-over-JIT still skips JIT on delete (today's bug); catalog still resurfaces because it has no row. |

PR 1 is the vocabulary. PR 2 is the agentic win. PR 3 is membership as a product. PR 4 is detach. Do not merge a mechanical `flow.service.ts` move with PR 2's behavior — extract only the action lookup jobs need.

## Migration and deploy order

**PR 1**

- Types and identifiers only. Revert is the inverse rename. No migration, no runtime change.

**PR 2**

- Expand only. Flag default `false` and overlay `'{}'` mean existing rows stay off when the migration runs. New inserts from create paths set the flag `true`.
- Revert: drop the two columns. In-flight action runs that already resolved a live `file_location` finish; new resolves after revert 404 again.
- Jobs and server must deploy together: jobs without the `templates-zero/` branch would look up a missing sync config and throw `Action not found` for live names. Ship jobs first or same release. If they must be sequenced: jobs (harmless — no live names yet) → API (starts listing/running).
- No data backfill. Restartable: n/a.

**PR 3**

- Enable/disable `jsonb_set`s (or deletes a key on) the config row. Revert after customers have used disable: dropping the column removes those exceptions, so names become live again if the flag is on. Call that out; it is the only customer-visible rollback surprise in the stack. If we must revert PR 3 after use, keep the column and only revert the UI/API — or accept re-enabling.
- Flag flip is a transactional **complement** on the same row: rewrite `catalog_action_overrides` to `catalogNames − ownedNames − oldKeys` with value `!newFlag`, and set the flag. Reversible by flipping back: membership of names that existed at both flips is preserved; names added to the catalog between flips follow the flag that was on when they appeared. Concurrent toggles must use `jsonb_set` or lock the config row so two enables cannot clobber.

**PR 4**

- Template 409 is additive (stricter). Revert reopens the API hole; UI still hides Deploy for owned names.
- Reactivate-on-delete is additive. Revert returns to today's "delete repo, skip JIT".
- Docs only otherwise.

Old and new coexist for the whole stack: pinned `source: 'catalog'` rows and live catalog are different layers. There is no cutover window.

## Risks and the point of no return

There is **no one-way data rewrite**. The closest things:

1. **Jobs/API skew** (PR 2): list says the action exists, jobs throw. Sequence jobs first.
2. **Revert of overlay after customers disabled actions** (PR 3): disabled names come back. Not a migration; operational.
3. **Existing integrations stay empty**, and PATCH true does not change that for current catalog names. A support `UPDATE` of the flag without the conversion would blast; never do that. Bulk-on for an old integration is recreate with the flag, not a SQL flag flip.

Shopify-scale listing is in-process merge of ≤133 catalog actions plus owned rows. Pagination total includes live. Search is a name/description filter on the merged set.

`id: null` is a public API change for `GET /integrations/:key/functions`. Clients that assume `id: number` break. Document it; dashboard is updated in PR 3 (PR 2 can keep returning live functions to MCP/public list before the dashboard understands `id: null` — the Functions tab would try copy-deploy on toggle). **So PR 2 must not light up the dashboard toggle for live rows**, or PR 2+3 ship together. Prefer: PR 2 returns live functions from public/MCP/agent paths; the dashboard Functions tab still uses the same list endpoint. If PR 2 ships alone, `FunctionSwitch` seeing `id: null` + `enabled: true` will no-op on disable (`onDisable` requires `flow.id`) and Enable would copy-deploy. **Gate PR 2's list union on the dashboard by shipping PR 3 in the same release, or make FunctionSwitch a no-op for `source === 'nango-catalog'` in PR 2.** The second is ~20 lines and makes PR 2 actually deployable alone. Do that.

Logs: never write `syncConfigId: 0`. Name-only is enough (`packages/logs/lib/models/helpers.ts:50`).

## Open questions

- Public/MCP create default on: this plan says yes (same as the dashboard checkbox). Push back if API consumers should stay empty until they pass the flag.
- Checkbox copy is "Auto-updating actions catalog" unless product wants the flag name spelled out.

## Appendix — per PR

### PR 1: `refactor(functions): rename DeployedNangoFunction to ListedNangoFunction`

**Files** (grep, no behavior)

- `packages/types/lib/functions/domain.ts` and every import of `DeployedMeta`, `DeployedNangoFunction`, `DeployedNangoSyncFunction`, `DeployedNangoActionFunction`, `DeployedNangoOnEventFunction`
- `toDeployedNangoFunction` → `toListedNangoFunction` in `packages/shared/lib/services/functions/legacy/mappers.ts`
- `findActiveDeployedMeta` → `findActiveFunctionAvailability`
- Webapp `Functions/Tab.tsx`, `FunctionSwitch.tsx`, `utils/scripts.ts`; server list/MCP tests

**Interfaces**

```
DeployedMeta                    → FunctionAvailability
DeployedNangoFunction           → ListedNangoFunction
DeployedNangoSyncFunction       → ListedNangoSyncFunction
DeployedNangoActionFunction     → ListedNangoActionFunction
DeployedNangoOnEventFunction    → ListedNangoOnEventFunction
```

`NangoFunction` (no availability) stays. `NangoFunctionTemplate.deployed` **JSON field stays** `deployed`; its type becomes `FunctionAvailability | undefined`. Do not touch `FunctionDeployedMetadata` (audit of a deploy event).

No aliases. This PR is the grep so later PRs never say `DeployedNangoFunction`. `id` remains `number`; nullability is PR 2.

**How it's tested**

- `tsc` / existing unit tests. No new cases. A reviewer should be able to diff and see zero logic changes.

### PR 2: `feat(functions): run and list live catalog actions`

**Files**

- `packages/database/lib/migrations/<ts>_catalog_action_live.cjs`
- `packages/types/lib/integration/db.ts`, `packages/types/lib/integration/api.ts`, `packages/types/lib/functions/domain.ts` (`FunctionAvailability.id` becomes `number | null`; `FunctionListSource = FunctionSource | 'nango-catalog'`)
- `packages/shared/lib/services/catalog/actions.ts` (new)
- `packages/shared/lib/services/catalog/membership.ts` (new) — `isLiveCatalogAction({ flag, overrides, owned })`; PATCH conversion lives here too but is only *called* from the integration PATCH in PR 3. PR 2 can export the resolver and unit-test it with fixture maps.
- `packages/shared/lib/services/catalog/resolveAction.ts` (new)
- `packages/shared/lib/services/functions/legacy/service.ts`, `models/functions.ts`, `mappers.ts`
- `packages/server/lib/services/action.service.ts`
- `packages/jobs/lib/execution/action.ts`, `packages/jobs/lib/execution/operations/start.ts`
- `packages/shared/lib/services/sync/config/endpoint.service.ts`
- `packages/server/lib/controllers/shared/integrations/functions/getCode.ts`
- `packages/server/lib/controllers/v1/integrations/postIntegration.ts` + `buildIntegrationConfig.ts` + public create + `integration.service.ts` + `shared-credentials.service.ts`
- `packages/server/lib/formatters/integration.ts`
- `packages/webapp/src/pages/Integrations/components/FunctionSwitch.tsx` — if `source === 'nango-catalog'`, disable is a no-op toast "coming" **or** (better) skip the copy-deploy branch and PATCH overlay once PR 3's client exists. Minimum for solo deploy: do not call `deployFlow` when `id` is null; leave the switch checked.
- Tests: membership (flag on/off, map keys, owned name wins); `executeAction` unknown vs live vs disabled owned; `findIntegrationFunctionCatalog` empty integration with flag on; `getCode` live TS; `listFunctions` pagination total includes live.

**Interfaces**

- `resolveRunnableAction` returns `{ kind: 'owned', config: DBSyncConfig } | { kind: 'live', config: DBSyncConfig, catalog } | { kind: 'missing' }`.
- Create: `auto_enable_catalog_actions?: boolean` default `true`.

**Migration**

- Add the two columns on `_nango_configs`. `exports.down` drops both. Follow recent ALTER style (`packages/database/lib/migrations/20250604140535_add_webhook_forwarding_enabled.cjs:5`).

**How it's tested**

- Unit (`membership.ts`): resolve is `overrides[name] ?? flag` — flag on/off × key absent / `true` / `false` × owned name. A redundant `{name: true}` with flag true still resolves on. Complement: `{delete: false, search: false}` against five catalog names becomes `{list: true, create: true, update: true}`. Catalog reader for a known provider action in `flows.zero.json`.
- Integration: create with flag true → runnable list includes every catalog action for that provider, `id: null`, `source: 'nango-catalog'`; `POST /action/trigger` with a connection runs (mock `getFile`); create with flag false → runnable list has none of them; owned repo row hides the live name; `getCode` returns catalog TS for a live-on name.

### PR 3: `feat(functions): catalog action membership and dashboard`

**Files**

- New `PATCH /api/v1/integrations/:providerConfigKey/functions/:name` (or `/catalog-actions/:name`) for enable/disable. Public equivalent if MCP/dashboard need it. Do not overload `PATCH /flows/:id`.
- `packages/server/lib/controllers/v1/integrations/providerConfigKey/patchIntegration.ts` — flag flip + snapshot.
- `FunctionSwitch.tsx`, `Tab.tsx` (badge + row key `${type}:${name}` not `${type}:${id}`), `One.tsx` (hide trash/download for live; Catalog badge; View code for `nango-catalog` too).
- `packages/webapp/src/pages/Integrations/Create.tsx` — checkbox, default checked, passed in `PostIntegration` body.
- `getTemplates.ts` — an **on** live name counts as deployed so Plus is hidden. An **off** catalog action stays on Templates; Enable is overlay membership, not `deployTemplate`.

**Interfaces**

- Enable/disable live: `jsonb_set` (or `-` to delete) `{name: desired}` on the config row; drop the key when `desired === flag`. Lock the row or use `jsonb_set` so concurrent toggles of different names cannot clobber.
- PATCH integration `auto_enable_catalog_actions` runs `convertCatalogMembership({ catalogNames, ownedNames, overrides })` → new map with value `!newFlag`, then `UPDATE` flag + map in one statement. No `enable_all_current`. Idempotent: PATCH true when already true is a no-op (do not re-complement and wipe later toggles).

**How it's tested**

Membership conversion and toggles — each case is a test, not a comment:

*Create*

- Flag true, empty overlay → every catalog action for the provider is on (runnable list count = catalog actions; MCP sees them).
- Flag false, empty overlay → runnable list has 0 catalog actions; Templates still lists them as off.

*Individual toggle*

- Flag true, disable `A` → overlay `{A: false}`; `A` unknown to `executeAction` / absent from MCP; other catalog actions still on.
- Flag true, re-enable `A` → overlay `{}`; `A` on again.
- Flag false, enable `A` → overlay `{A: true}`; only `A` on.
- Flag false, disable `A` → overlay `{}`; 0 on.

*PATCH false → true (the blast we must not do)*

- Overlay `{}` → after PATCH, runnable list still 0; map is every current catalog name at `false`; a name **not in that snapshot** (stub an extra `catalogNames` entry on a later resolve) is on.
- Overlay `{A: true}` → after PATCH, map is catalog − `{A}` − owned, all values `false`; `A` still on (key absent, default true); every other current name off; a later extra name is on.
- Overlay `{A: true, B: true}` plus owned repo `C` → map is catalog − `{A, B, C}`, all values `false`; `A` and `B` on via default; no key for `C`; `C` still owned.

*PATCH true → false*

- Overlay `{}` (all on via default) → map is every current catalog name at `true`; all those stay on; a name not in that snapshot is off.
- Overlay `{A: false}` (rest on) → after PATCH, map is catalog − `{A}`, all values `true`; `A` off (key absent, default false).

*Conversion guard*

- Overlay `{delete: false, search: false}`, flag true, **UPDATE the flag to false without complement**: `delete`/`search` stay off (map values are absolute) but `list`/`create`/`update` go off via the new default. The public PATCH must complement so those three stay on (`true`). Test convert-then-flag, not flag-alone.

*Idempotence and owned*

- PATCH true when already true → no overlay rewrite.
- PATCH false when already false → no overlay rewrite.
- Owned name is never added as a key in `catalog_action_overrides` by conversion or by the enable-by-name API (409 or no-op; owned disable still uses `PATCH /flows/:id`).
- Two concurrent enables of different names both persist (config row lock or `jsonb_set`, not read-modify-write of the whole object in JS without a lock).

*UI*

- FunctionSwitch does not call pre-built deploy for `source === 'nango-catalog'`.
- Create unchecked → runnable list empty, Templates lists catalog actions; enable one name → that name only on the Functions tab and in MCP.

### PR 4: `feat(functions): catalog overlay precedence and detach`

**Files**

- `packages/shared/lib/services/deploy/template.ts` — `getSyncAndActionConfigByParams` without the `source: 'catalog'` filter; also 409 if `resolveRunnableAction` would return `live`.
- `packages/server/lib/services/integrationTemplate.service.ts` — map the new 409.
- `packages/server/lib/tasks/startFunctionDeletion.ts` (or `deleteSyncConfig`) — after soft-delete, `UPDATE … SET active = true` on the latest inactive sibling. `switchActiveSyncConfig` today retargets `_nango_syncs` for syncs; actions have no `_nango_syncs` row, so reactivation is config-only.
- `docs/guides/functions/functions-guide.mdx` Option 1 + detach.
- `isProtectedExistingFunction` (`packages/server/lib/services/functionDeployment.service.ts:352`) stays: JIT still cannot clobber repo. Catalog pin cannot clobber repo/standalone after the 409.

**How it's tested**

- Template deploy 409 on repo/standalone/live.
- Seed standalone inactive + repo active → delete repo → standalone active, list source `standalone`.
- Delete standalone with no other owned row, flag true, empty overlay → name is live catalog (`source: 'nango-catalog'`).
- Delete repo, flag false, empty overlay → name is not live (default off); Templates still offers Enable (`jsonb_set` `{name: true}`), not copy-deploy.
- Delete repo, flag true, overlay `{name: false}` → name stays off.
