# Tools catalog, inside the existing three-PR stack

`.deep-plan/` can be gitignored. This replaces the catalog type in the open stack ([#7611](https://github.com/NangoHQ/nango/pull/7611), [#7612](https://github.com/NangoHQ/nango/pull/7612), [#7613](https://github.com/NangoHQ/nango/pull/7613)). It does not open a fourth PR.

## The problem

`resolveRunnableAction` turns a catalog hit into a `DBSyncConfig` with `id: 0` before any caller has asked to run it (`packages/shared/lib/services/catalog/resolveAction.ts:45`). That is the old stored shape. The new function model already has this translation, and it lives in one place: `toLegacyConfig` (`packages/jobs/lib/execution/function.ts:561`), with an explicit TODO that `NangoProps` should stop requiring a sync config (`packages/jobs/lib/execution/function.ts:560`).

Doing the same translation inside the catalog reader means every later caller — list, logs, get-code, the v1 proxy — receives a fake sync config. The files in `flows.zero.json` are still action modules, so they also cannot be sent through `startFunction`. The runner throws unless `def.type === 'function'` when `scriptType` is `'function'` (`packages/runner/lib/exec.ts:202`).

## Today

The reader exports `CatalogAction`: name, description, scopes, an input model, output models, `endpoint`, JSON schema, `sdk_version`, features (`packages/shared/lib/services/catalog/actions.ts:13`). `resolveRunnableAction` returns `{ kind: 'deployed', config: DBSyncConfig }`, `{ kind: 'catalog', config: DBSyncConfig, catalog: CatalogAction }`, or `missing` (`packages/shared/lib/services/catalog/resolveAction.ts:9`). The catalog arm always includes the synthetic row.

Nothing in production calls the resolver until the triggers PR. The listing PR unions `CatalogAction` into the legacy function list as `type: 'action'`, `source: 'live-catalog'`, `id` null. The triggers PR calls `resolveRunnableAction` from `executeAction`, `startAction`, and `getCode`, and reads `endpoint` off the catalog action for the v1 proxy. `startScript` only needs `file_location` and `sync_name` off that object (`packages/jobs/lib/execution/operations/start.ts:40`); the rest exists because `NangoProps.syncConfig` is a `DBSyncConfig`.

A deployed action row still wins, including when it is disabled. The flag defaults off (`packages/utils/lib/environment/detection.ts:45`).

## After

The catalog speaks a tool. A tool is the data we actually have for one prebuilt action, named as the thing you call, without a sync-config id.

```ts
interface CatalogTool {
    name: string;
    description: string;
    input: string | null; // model name, the list column of the same name
    output: string[]; // model names, the list's `returns`
    scopes: string[];
    jsonSchema: JSONSchema7 | null;
    version: string;
    sdkVersion: string; // action runner requires a `-zero` sdk version
    fileLocation: string; // templates-zero JS
    sourceLocation: string; // templates-zero TS
    capabilities: FunctionCapabilities;
    module: 'action';
}
```

`capabilities.usesCheckpoints` comes from the template's `features`. The other four booleans are `false`: `flows.zero.json` has no signal for them, and `usesInvoke` means "this function calls invoke," not "this can be called" (`packages/shared/lib/services/functions/models/validate` is not the source; the bundle check is `usesInvoke` must match `requires.invoke`).

`module` is `'action'` on every row this catalog can load. It is a constant so the jobs adapter can refuse anything else instead of guessing. There is no `trigger`. `invokeFunction` accepts `wait` only for `kind: 'http'`, and `kind: 'none'` is rejected even though the comment calls it invoke-only (`packages/shared/lib/services/functions/invoke.ts:255`, `packages/types/lib/function/config.ts:32`). Inventing either kind would be a lie.

`endpoint` is not a field. The v1 proxy gets `{ name, method, path }[]` from `listCatalogToolEndpoints(provider)`, used only by `catalogActionByEndpoint`.

`resolveRunnableTool` returns:

- `{ kind: 'deployed'; config: DBSyncConfig }` — the real action row, unchanged
- `{ kind: 'catalog'; tool: CatalogTool }` — no sync config
- `{ kind: 'missing' }`

The only function that builds a `DBSyncConfig` from a tool is `toRunnableSyncConfig` in `packages/jobs/lib/execution/action.ts`, called from `startAction` when the kind is `'catalog'`. It is the action-module sibling of `toLegacyConfig`: `id: 0`, `type: 'action'`, `file_location` from `tool.fileLocation`, `sdk_version` from `tool.sdkVersion`, `features: ['checkpoints']` when `capabilities.usesCheckpoints`, `enabled: true`. `startScript` and the runner are unchanged, so `scriptType` stays `'action'` and the module check stays `def.type === 'action'` (`packages/runner/lib/exec.ts:229`).

`executeAction` branches on kind. A deployed row keeps the enabled check and logs `{ id, name }`. A catalog tool is runnable, and the log stores the name only. It does not build a sync config; the orchestrator is called with the action name, and jobs resolve again.

`getCode` on a catalog kind reads `tool.sourceLocation`.

The list row stays a listed action: `type: 'action'`, `id: null`. Its `source` is `tools-catalog`, not `live-catalog`. That string is list/API only. It is never written to `FunctionSource` on a sync config. The SQL bind reads `name`, `description`, `scopes`, `input`, `output` off the tool. `jsonSchema` is still hydrated after the query.

## What will look different in the codebase

**PR 1, reader.** `packages/shared/lib/services/catalog/actions.ts` exports `CatalogTool`, `listCatalogTools`, `getCatalogTool`, `listCatalogToolEndpoints`. `catalogActionJsPath` / `catalogActionTsPath` become private; the paths live on the tool. `isTemplatesZeroPath` stays exported. `resolveAction.ts` is renamed `resolveTool.ts`. `toSyntheticSyncConfig` is deleted. `packages/shared/lib/index.ts:70` exports the new names. Resolver tests assert a `CatalogTool`, not a sync config with `id: 0`.

**PR 2, listing.** `packages/shared/lib/services/functions/legacy/models/functions.ts` imports `CatalogTool`. The listing bind and schema hydrate use the renamed fields (`jsonSchema`, same `input` / `output` / `scopes`). The list source string changes from `live-catalog` to `tools-catalog` everywhere it is a value: `FunctionListSource` in `packages/types/lib/functions/domain.ts`, the SQL literal, the MCP zod enum, the delete guard, and the dashboard switch. No new response fields.

**PR 3, triggers.** `startAction` calls `toRunnableSyncConfig` for `kind: 'catalog'`. `executeAction` and `getCode` stop reading `resolved.config` on that arm. `endpoint.service.ts` calls `listCatalogToolEndpoints`. The jobs unit test still asserts the remote `templates-zero/...cjs` load; it also asserts the sync config handed to `invoke` came from the tool (`file_location`, `type: 'action'`, `sdk_version` ending in `-zero`).

## What deliberately does not change

- These stay three PRs. No fourth.
- `GET /integrations/:uniqueKey/functions` still returns listed actions, not function versions (`packages/server/lib/routes.public.ts:306`). The only change to that body is `source: 'tools-catalog'`.
- `POST /functions/invocations` and `function_configs` are untouched (`packages/server/lib/routes.public.ts:452`). Catalog tools do not go through `startFunction`.
- `POST /action/trigger` is still the call path (`packages/server/lib/routes.public.ts:457`).
- A deployed action occupies the name, including when disabled. Syncs do not.
- `FLAG_LIVE_CATALOG_ACTIONS_ENABLED` keeps its name and defaults to false.
- `toLegacyConfig` is not refactored. `NangoProps.syncConfig` stays a `DBSyncConfig`.
- No new columns, no backfill, no catalog rows written.

## Approach — and what we rejected

The catalog type is the new-world noun (a tool, with capabilities and an explicit module kind). The sync config appears only at the jobs boundary that already cannot run without one.

Rejected: filling `trigger: { kind: 'http' }` or `{ kind: 'none' }` and calling `startFunction`. The runner would reject the module, and `supportInvocation` would reject `none`.

Rejected: leaving `toSyntheticSyncConfig` in the resolver and only renaming `CatalogAction` to `CatalogTool`. The review comment is about the fake sync config, not the word "action."

Rejected: changing the public list body to a function version. That endpoint is the legacy list, and this stack already defines its catalog row.

## The stack

| # | PR | What it does | ~diff | Deployable alone? |
|---|---|---|---|---|
| 1 | #7611 reader | `CatalogTool` and `resolveRunnableTool`. No sync config on a catalog hit | ~150 lines of type and test edits on top of the existing reader | Yes. Nothing calls it yet. Flag off |
| 2 | #7612 listing | List projection reads the tool. List source is `tools-catalog` | Rename, the source string, and field updates inside the listing commit | Yes. Lists tools, does not run them |
| 3 | #7613 triggers | `toRunnableSyncConfig` in `startAction`. Callers stop expecting a catalog sync config | The triggers commit, plus the adapter and the execute/getCode/endpoint call-site edits | Yes, once 1 and 2 are in. Flag still off |

Each PR is updated in place and restacked. They are already on GitHub, so updating them is a force-with-lease push of the rewritten commits.

## Migration and deploy order

No persisted data. Old and new do not coexist in production: the flag is off, and these PRs are the first introduction of the catalog type. In-flight action runs are deployed sync configs; they never hit the catalog arm.

Merge reader, then listing, then triggers. Flip `FLAG_LIVE_CATALOG_ACTIONS_ENABLED` only after triggers is deployed. Until that flip, list and invoke behave as they do on master.

Reverting any of the three before the flag is on is a normal revert. Reverting triggers after the flag is on makes listed tools fail at invoke (`unknown_action` / "Action not found"). Reverting listing after the flag is on removes them from the list while triggers could still run a name that was never deployed.

## Risks and the point of no return

This refactor writes nothing. The point of no return is not in these PRs. It is the later flag flip: clients will see `source: 'tools-catalog'` rows and can call them. Turning the flag back off hides them again; it does not migrate data. The string has not shipped, so nothing stored has to be rewritten.

The stack risk is compile order. PR 2 and PR 3 import the reader by name. Renaming in PR 1 without updating the two above breaks those branches until they are restacked.

`id: 0` still exists, but only inside `toRunnableSyncConfig`, and only on the jobs process. `executeAction` must not pass that id into the log. The triggers code already drops a falsy id; the new branch should log the name because there is no id, not because `0` is falsy.

## Open questions

None. `module: 'action'` stays until a catalog file is compiled as `type: 'function'`. That file is a later catalog change, not this stack.

## Appendix — per PR

### PR 1: `refactor(catalog): return a tool instead of a sync config (NAN-6903)`

Files: `packages/shared/lib/services/catalog/actions.ts`, `resolveTool.ts` (replaces `resolveAction.ts`), `packages/shared/lib/index.ts`, the reader unit tests.

`listCatalogTools(provider)` and `getCatalogTool(provider, name)` replace the action pair. `listCatalogToolEndpoints` filters to entries that have an endpoint and returns `{ name, method, path }`. Paths are set when the tool is built, using the same `templates-zero/{folder}/build/...cjs` and `templates-zero/{folder}/actions/{name}.ts` strings as now.

`resolveRunnableTool` keeps the deployed lookup via `getSyncConfigRaw` and the flag check. The catalog return is `{ kind: 'catalog', tool }` with no `config`.

Tests: a github action becomes a tool with `module: 'action'`, `fileLocation` under `templates-zero/`, `capabilities.usesCheckpoints` matching `features`, and no `endpoint` key. Flag off still returns `missing` without reading the catalog. A deployed row still returns `kind: 'deployed'`.

### PR 2: `refactor(functions): list catalog tools on the legacy function list (NAN-6903)`

Files: `packages/shared/lib/services/functions/legacy/models/functions.ts` and its tests, `packages/types/lib/functions/domain.ts`, `packages/server/lib/controllers/mcp/functions/schema.ts`, `packages/server/lib/controllers/shared/integrations/functions/deleteFunction.ts`, `packages/webapp/src/pages/Integrations/components/FunctionSwitch.tsx`, and the tests that assert the source string.

`toCatalogListingBind` picks `name`, `description`, `scopes`, `input`, `output`. `hydrateCatalogJsonSchemas` reads `jsonSchema`. The SQL source literal is `'tools-catalog'`. `FunctionListSource` is `FunctionSource | 'tools-catalog'`. Delete still returns 400 for that source. The switch stays disabled for it. `type` stays `'action'` and `id` stays null.

### PR 3: `feat(functions): run catalog tools through the action runner (NAN-6903)`

Files: `packages/jobs/lib/execution/action.ts`, `packages/server/lib/services/action.service.ts`, `packages/server/lib/controllers/shared/integrations/functions/getCode.ts`, `packages/shared/lib/services/sync/config/endpoint.service.ts`, `packages/jobs/lib/execution/operations/start.ts` (the templates-zero remote read stays here), and the tests those files already have.

`startAction` on `kind: 'catalog'` sets `syncConfig = toRunnableSyncConfig(tool, { environmentId, configId })` and continues through the existing enabled check (the built config is `enabled: true`). On `kind: 'deployed'` it uses the row. `kind: 'missing'` still throws `Action not found: ${task.id}`.

`executeAction` on `kind: 'catalog'` does not consult `enabled` and logs `{ name: tool.name }`. On `kind: 'deployed'` it keeps the disabled error and `{ id, name }`.

`getCode` loads `tool.sourceLocation` for a catalog kind. The ambiguous sync-vs-catalog 409 stays, using `tool.fileLocation` as the action match's file location.

`catalogActionByEndpoint` filters `listCatalogToolEndpoints` instead of `tool.endpoint`.
