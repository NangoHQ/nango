# Playground reads the functions list

## The problem

Catalog actions are runnable, and the functions tab lists them. The playground dropdown does not. It loads `GET /api/v1/integrations/:providerConfigKey/flows`, and that payload marks every template action `enabled: false`. The dropdown keeps only `enabled === true`.

## Today

Opening the playground with an integration selected calls `useGetIntegrationFlows` from two places: the shell (`packages/webapp/src/features/Playground/index.tsx:48`) and the selectors (`packages/webapp/src/features/Playground/PlaygroundSelectors.tsx:44`). Both read `flowsData.data.flows`.

`flow.service.ts` builds template actions with `enabled: false` (`packages/server/lib/services/flow.service.ts:88`). `getIntegrationFlows` appends a template only when no deployed row has the same name. The selectors then drop anything that is not enabled (`packages/webapp/src/features/Playground/PlaygroundSelectors.tsx:71`). The shell also refuses Run when the selected row has `enabled === false` (`packages/webapp/src/features/Playground/index.tsx:81`).

The input form does not use a separate schema request. It reads `json_schema` and `input` off the selected row (`packages/webapp/src/features/Playground/index.tsx:60`). Run uses the stored name and `functionType`; it does not send a sync-config id (`packages/webapp/src/features/Playground/usePlayground.ts:98`).

The functions list is a different endpoint, `GET /api/v1/integrations/:providerConfigKey/functions`. Catalog actions are on it when `FLAG_CATALOG_TOOLS_ENABLED` is on, with `enabled: true`, `source: "tools-catalog"`, and the same `input` / `json_schema` the form already reads. The route pages that list: default 20, maximum 100 (`packages/server/lib/helpers/validation.ts:70`). The functions tab already walks those pages with `useGetIntegrationFunctions` (`packages/webapp/src/hooks/useIntegrationFunctions.tsx:17`).

## After

The playground loads that functions list and ignores `/flows`.

One hook, used by the shell and the selectors, calls `useGetIntegrationFunctions` with `limit: 100` and no `type` or `search`. While the panel is open and a next page exists, it calls `fetchNextPage` until `pagination.total` is loaded. React Query dedupes the two callers because they share the query key. While the panel is closed, `queryEnv` is empty and the query stays disabled, as it is today (`packages/webapp/src/features/Playground/index.tsx:46`).

The dropdown is still the same combobox, fed by one in-memory array. Rows stay in the list when `type` is `action` or `sync` and `enabled === true`. Catalog actions pass that filter because the list marks them enabled. Disabled deployed rows stay out. On-events stay out. A catalog action whose name is occupied by a deployed action is absent from the list, so a disabled deployed action still hides the catalog copy.

The selected row is still found by name. Its `json_schema` and `input` still build the form. Catalog `json_schema` is the same object the catalog reader already puts on the list (`packages/shared/lib/services/functions/legacy/models/functions.ts:437`). Run is unchanged.

With the flag off, the list has no catalog rows, so the dropdown matches the functions tab: deployed functions only.

## What will look different in the codebase

- New `packages/webapp/src/features/Playground/usePlaygroundFunctions.ts`. It wraps `useGetIntegrationFunctions`, drains pages, and returns the flattened `ListedNangoFunction[]`.
- `packages/webapp/src/features/Playground/index.tsx` and `PlaygroundSelectors.tsx` drop `useGetIntegrationFlows` and `NangoSyncConfig`. They read the hook's array. `resolvedType` becomes the row's `type`.
- No server change. `flow.service.ts` still sets template actions to `enabled: false`.

## What deliberately does not change

- `enabled: true` is still the dropdown rule. Catalog actions are not a special case in the playground.
- Template syncs stay hidden. The functions list does not include undeployed syncs, and the playground still will not run them.
- The combobox does not page as the user scrolls. Pages are fetched when the panel opens.
- Finding the selected function stays name-only (`packages/webapp/src/features/Playground/index.tsx:57`). A sync and an action that share a name still resolve to whichever row comes first.
- `usePlayground.ts` still triggers by name and type.
- The functions route's page size stays max 100.

## Approach — and what we rejected

Setting `enabled: true` on template actions in `flow.service.ts` would show them in this dropdown, and it would also mark undeployed templates as on for every other caller of that catalog. `enabled` there means a deployed row is turned on.

Scroll-to-load inside the combobox would mean teaching `Combobox` to ask for more options. The list fits in a few pages of 100, and the form needs the selected row's schema even when that row is not on the first page. Prefetching is the smaller change.

## The stack

| # | PR | What it does | ~diff | Deployable alone? |
| --- | --- | --- | --- | --- |
| 1 | `feat(webapp): list catalog actions in the playground` | Playground reads the functions list and drains its pages | ~150 lines | Yes |

## Migration and deploy order

Webapp only. No schema, no backfill, no coexistence window. Ship it any time after the functions list is deployed, which it is. The playground shows catalog actions only when `FLAG_CATALOG_TOOLS_ENABLED` is already on for that environment. Revert the webapp commit and the dropdown goes back to `/flows`.

Nothing is in flight that this deploy changes. A run started before the deploy finishes on the old client.

## Risks and the point of no return

There is no point of no return. The change is a client read path.

The practical risk is a catalog larger than a few pages: the dropdown stays incomplete until the last page arrives, and the input form stays empty for a persisted selection until that row's page is loaded. Drain pages before treating the list as complete, and keep the selected name in the combobox even when its row has not arrived yet. That pin already exists for a missing option (`packages/webapp/src/features/Playground/PlaygroundSelectors.tsx:78`).

A second risk is two components both calling `fetchNextPage`. Share one query and guard on `hasNextPage && !isFetchingNextPage`.

## Open questions

None. Name-only selection is left as it is today.

## Appendix — per PR

### PR 1: feat(webapp): list catalog actions in the playground

Files:

- Add `packages/webapp/src/features/Playground/usePlaygroundFunctions.ts`.
- Edit `packages/webapp/src/features/Playground/index.tsx`.
- Edit `packages/webapp/src/features/Playground/PlaygroundSelectors.tsx`.

Hook:

- Arguments: `env`, `providerConfigKey`. Pass `limit: 100`. Leave `type` and `search` unset so syncs and actions both come back.
- `enabled` when both arguments are non-empty. The shell already passes an empty env while the panel is closed.
- Effect: if `hasNextPage && !isFetchingNextPage`, call `fetchNextPage`.
- Return `data.pages.flatMap((page) => page.data)`.

Selectors:

- Options are rows with `type` of `action` or `sync` and `enabled === true`.
- Badge text is `row.type`.
- Keep the unshift of the persisted function name when it is not in the loaded pages yet.

Shell:

- Selected row is `rows.find((row) => row.name === playgroundFunctionName)`.
- `input` and `json_schema` feed the existing schema lookup, including `definitions[input]`.
- `isFunctionDisabled` stays `enabled === false`.

Test:

- Unit-test the hook's flatten and the enabled/type filter if they are pure. The page-drain effect is a React Query loop; confirm it in the browser: open the playground on a provider with catalog actions, see those actions, pick one, confirm the input form renders, run it.
- With the flag off, the same provider shows only deployed enabled functions.
