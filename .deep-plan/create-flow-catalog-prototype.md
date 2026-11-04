# Create flow + catalog prototype (for a Loom)

## The problem

New users go straight to the integrations page, search for their provider, and hit a dead end:

- The search only covers integrations they already have. A new account has none, so it comes back empty.
- The create page asks for credentials before showing anything Nango can do with that provider.
- When there's no shared Nango app, they have nothing to type into the form, and many leave.

This prototype makes three small changes to the current flow. The goal is a Loom for early feedback, not a finished feature. It also builds the function list as a reusable piece for a future top-level Catalog tab.

## Today

- **Integrations search** (`packages/webapp/src/pages/Integrations/Show.tsx:171`). Fuse searches the env's integrations only. With no match you see "No integrations found" and a generic "Set up new integration" link to the provider picker, where you have to search again. The search text isn't stored anywhere. The input is uncontrolled and only the filtered list is kept.
- **Provider picker** (`packages/webapp/src/pages/Integrations/CreateList.tsx:166`). It loads every provider with `useProviders` and renders rows with a private `Provider` component. Picking one goes to `/:env/integrations/create/:provider` (`packages/webapp/src/pages/Integrations/CreateList.tsx:90`).
- **Create page** (`packages/webapp/src/pages/Integrations/Create.tsx:113`). It's one card: a header (logo, badges, setup guide link) and `AuthCreateForm`, which picks a form by auth mode (`packages/webapp/src/pages/Integrations/components/forms/AuthCreateForm.tsx:17`). OAuth providers get two tabs, "Nango developer app" (only when there's a shared app) and "Custom developer app" (`packages/webapp/src/pages/Integrations/components/forms/OAuthCreateForm.tsx:108`). There's no function list on this page.
- **After create** (`packages/webapp/src/pages/Integrations/Create.tsx:48`). With a shared app you land on Functions, otherwise on Settings.
- **Creating without credentials already works.** All credential fields are optional on both client and server. `missing_fields` is computed on the row (`packages/shared/lib/services/config.service.ts:366`). The only static-MCP case that fails is guarded in `packages/server/lib/controllers/v1/integrations/postIntegration.ts:119`. Enabling templates on that integration still works too, because deploy doesn't check credentials (`packages/server/lib/controllers/v1/flows/preBuilt/postDeploy.ts:39`).
- **Missing credentials are nearly invisible.** The only place they show is the Test connection card. It disables Authorize and says "This integration is not fully configured" (`packages/webapp/src/pages/Connection/components/CreateConnectionSelector.tsx:97`). The list badge and settings banner that used to show `missing_fields` were removed in #5067 and #5176.
- **A provider-level catalog endpoint already exists and nothing in the dashboard calls it:** `GET /api/v1/providers/:providerConfigKey/templates` (`packages/server/lib/routes.private.ts:362`, `packages/server/lib/services/provider.service.ts:74`). The Functions tab uses the integration-scoped one instead (`packages/webapp/src/hooks/useIntegrationFunctions.tsx:156`).

## After

**1. Search never dead-ends.** When your search matches no integrations, the empty state lists up to 5 matching providers, using the same rows as the picker. Clicking one goes straight to that provider's create page, with no second search. A "See all providers" link keeps the old way out.

**2. The create page shows what you get.** Below the header there's a "Functions" section listing the provider's actions and syncs: name, description, a type filter, search, and counts. Clicking a function opens a read-only details panel (input/output schema, code). It needs no integration.

The order depends on the provider:
- **Shared Nango app:** the form comes first ("Create" is zero-input), with the catalog below it.
- **No shared app:** the catalog comes first, then the credentials form. Seeing the value is the motivation to go set up an OAuth app.

**3. "Set up later".** Forms that ask for credentials get a second button next to "Create". It creates the integration with no credentials and lands you on its Functions tab, where you can browse and enable functions. A banner on the integration page says credentials are missing and links to Settings. The Test connection card keeps blocking Authorize with its existing message. The button is hidden wherever it makes no sense:
- the "Nango developer app" tab, which already needs no input
- forms with nothing to fill
- static MCP, where the server rejects an empty create
- providers whose required `integration_config` fields the server enforces

**The demo story:** search "salesforce" on the integrations page → click the suggestion → see 40+ functions before any form → "Set up later" → land on Functions → banner says "add credentials to connect".

## What will look different in the codebase

New files:
- `packages/webapp/src/pages/Integrations/components/ProviderRow.tsx`: the picker row, moved out of `CreateList.tsx` and exported.
- `packages/webapp/src/hooks/useProviderSearch.tsx`: the picker's Fuse config (displayName 0.6, name 0.4, threshold 0.3), shared by the picker and the empty state.
- `packages/webapp/src/pages/Integrations/components/functions/`: presentational pieces moved out of the Functions tab: `FunctionNameCell`, `ColumnHead`, `getInputSchema`, `getOutputSchemas`, and the Input/Output/Code body of the details panel as `FunctionDetailsContent`.
- `packages/webapp/src/pages/Integrations/components/FunctionCatalog/FunctionCatalog.tsx`: the read-only catalog. Props: `{ provider: string }`. It fetches through the new hook and keeps its filter/search/selection state locally, not in the URL, so it can sit on any page.
- A `useGetProviderTemplates(env, provider)` hook in `packages/webapp/src/hooks/useIntegrationFunctions.tsx`, typed with the existing `GetProviderTemplates`.
- `packages/webapp/src/pages/Integrations/components/forms/CreateActions.tsx`: the "Create" plus "Set up later" pair, dropped into the forms that need it.
- A missing-credentials `Alert` on `packages/webapp/src/pages/Integrations/providerConfigKey/Show.tsx`, driven by `integration.missing_fields`.

Changed behavior:
- `Show.tsx` keeps the search text in state and calls `useProviders(env)`. That's a new ~600KB request on that page, shared with the picker through the react-query cache.
- The landing rule after create in `Create.tsx` becomes: **auth sent → Settings, no auth sent → Functions.**
  - Shared app → Functions (unchanged).
  - "Set up later" → Functions (new).
  - Forms with nothing to fill (API key, basic, etc.) → **Functions instead of Settings.** This one is a deliberate change.
  - The custom tab with credentials typed in → Settings (unchanged).
- The Functions tab and its details panel import the moved pieces. Their behavior doesn't change.

No server, type or migration changes.

## What deliberately does not change

- No server or API changes. Both endpoints exist already.
- No analytics catalogue changes. `integrations:integration_create` already reports `has_missing_fields`, and `integrations:create_page_view` already reports `has_shared_credentials`. Events for empty-state clicks, catalog views and "Set up later" clicks come after feedback.
- No top-level Catalog tab, no navigation changes, and no change to getting started.
- The integration Functions tab keeps its current data flow, pagination and enable/disable switches. Only presentational pieces move.
- The zero-integrations empty state stays as it is. The demo env needs at least one integration to show change 1.
- The picker's own search, which doesn't match categories, stays as it is.

## Approach — and what we rejected

- **Reuse the existing provider templates endpoint rather than add one.** It already returns `(NangoSyncFunction | NangoActionFunction)[]` with no integration. Per-provider payloads are small: github is about 113KB, the largest about 640KB.
- **Move presentational pieces first, then build the catalog on them.** The alternatives were:
  - Making `integration` optional on `FunctionsTab` / `FunctionDetailsPanel`. Rejected: dozens of integration-only branches (switches, delete, playground, pagination, counts), and the risk of breaking a page people use every day.
  - Copying the components. Rejected: we'd end up with two catalogs to maintain, which is exactly what the future Catalog tab should avoid.
- **"Set up later" posts `{provider, useSharedCredentials: false}` directly and skips the form's validation.** If you type into a field and then clear it, it's sent as `''`. The server rejects that with `.min(1)` (`packages/server/lib/controllers/v1/integrations/validation.ts:19`), behind a generic error toast. Skipping the form avoids that.
- **Catalog below the form vs above it.** One order for everyone would be simpler. I chose order by `preConfigured` because the "no shared app" case is the one where people freeze. It's a single conditional, so the Loom can show both.

## The stack

Stacked on `gui/2026-10-22/feat-onboarding-analytics-events`. `Create.tsx` and `Show.tsx` already have that branch's tracking calls, and basing on master would conflict.

| # | PR | What it does | ~diff | Deployable alone? |
|---|---|---|---|---|
| 1 | `refactor(webapp): extract provider row and function display pieces` | Pure moves: `ProviderRow`, `useProviderSearch`, `functions/*`. No behavior change. | ~350 moved, ~40 new | Yes |
| 2 | `feat(webapp): suggest matching providers in integrations search empty state` | Search state, provider matches, direct link to the create page | ~100 | Yes. Uncontroversial, can merge without waiting for feedback |
| 3 | `feat(webapp): show function catalog on the integration create page` | Hook, `FunctionCatalog`, create page layout split by shared app | ~300 | Yes |
| 4 | `feat(webapp): add "Set up later" to integration create forms` | `CreateActions`, new landing rule, missing-credentials banner | ~150 | Yes |

For the Loom, check out PR 4's branch: it has all four. Open 3 and 4 as drafts until the feedback is in.

## Migration and deploy order

Frontend only, no persisted data, no contract changes, nothing in flight. Each PR can be reverted on its own after deploy.

Two things users will notice once deployed:
- PR 2 adds the providers request to the integrations page.
- PR 4 changes where no-auth creates land (Settings → Functions). That's visible for API-key providers too.

## Risks and the point of no return

There's no point of no return: no data, no migration.

Real risks:
- **Integrations without credentials pile up.** Bastien's concern. "Set up later" makes the existing empty-create path explicit, so expect more integrations with `missing_fields`. The banner in PR 4 is the only signal on the integration itself, since the list badge isn't coming back in this prototype. Measure how many get credentials within a week, using `has_missing_fields` plus later updates.
- **Alias providers** (e.g. `aircall-basic`). The catalog's Code tab needs `symLinkTargetName`, which only `getIntegration` returns. For the prototype, show code for non-alias providers only (hide the Code tab when the fetch 404s). The real fix is one formatter line on the server, later.
- **Tools-catalog accounts.** With `meta.toolsCatalog` on, the Functions tab labels catalog actions "tools-catalog" and shows them always enabled. The create-page catalog will label everything "template". That's fine for the demo, but worth noting if someone asks why the two differ.
- **Read-only users.** Empty-state suggestions and "Set up later" are gated by the same `environment:integrations:update` check as the existing buttons.

## Open questions

1. **Order on the create page.** Catalog first for no-shared-app providers: do you agree, or should it always sit below the form?
2. **"Set up later" on the custom tab when a shared app exists.** I'd hide it there, because the "Nango developer app" tab already gives a zero-input path. OK?
3. **Missing-credentials banner.** It brings back something #5067 / #5176 removed, and you made those PRs. Was the removal on purpose? If it was, the banner text should cover whatever the reason was.
4. **Demo providers.** Pick one with a shared app and one without, both with templates, in the env you'll record in. `preConfigured` is runtime data, so check it there. Candidates: github (shared) and salesforce or hubspot (check).

## Appendix — per PR

### PR 1: `refactor(webapp): extract provider row and function display pieces`
- Move `Provider` from `packages/webapp/src/pages/Integrations/CreateList.tsx:166` to `components/ProviderRow.tsx` and export it. Its virtualizer props are already optional.
- Move the Fuse config from `CreateList.tsx` into `hooks/useProviderSearch.tsx`, returning `(query) => ApiProviderListItem[]`.
- Move `ColumnHead` and `FunctionNameCell` (`packages/webapp/src/pages/Integrations/providerConfigKey/Functions/Tab.tsx:57`) into `components/functions/`.
- Move `getInputSchema` and `getOutputSchemas` (`packages/webapp/src/pages/Integrations/providerConfigKey/Functions/FunctionDetailsPanel.tsx:275`) into `components/functions/`.
- Split the panel: the schema tabs and the Code body become `FunctionDetailsContent({ fn, code, codePending, codeError })`. `FunctionDetailsPanel` keeps the header actions (delete, playground, pull command) and its integration-keyed fetches, and renders `FunctionDetailsContent`.
- Test: `npm run ts-build`, `npm run lint`. Click through the Functions tab on an existing integration: pills, search, open a template, open a deployed function, Code tab. The picker should look identical.

### PR 2: `feat(webapp): suggest matching providers in integrations search empty state`
- `Show.tsx`: keep `query` in state from `handleInputChange`. Call `useProviders(env)`. In the no-match branch (`packages/webapp/src/pages/Integrations/Show.tsx:171`), render `useProviderSearch(providers)(query).slice(0, 5)` as `ProviderRow`s. Clicking one navigates to `/${env}/integrations/create/${provider.name}`. Add a "See all providers" `ButtonLink` to `/integrations/create`.
- Keep the existing `PermissionGate`, and hide suggestions for read-only users.
- Test: search a provider you don't have → see suggestions → click → create page. Search nonsense → "No integrations found" with no suggestions. Check the zero-integrations env is unchanged.

### PR 3: `feat(webapp): show function catalog on the integration create page`
- Hook: `useGetProviderTemplates(env, provider)` on `/api/v1/providers/${provider}/templates?env=`, query key `['providers', env, provider, 'templates']`.
- `FunctionCatalog({ provider })`:
  - Actions/Syncs pills with counts (no Triggers, since provider templates have none), client-side search, and a table built from the PR 1 pieces.
  - The side panel uses `FunctionDetailsContent`, with code from `useGetTemplateFunctionCode({ provider })`. Hide the Code tab on error.
  - Loading uses skeletons. With zero templates: "No pre-built functions yet. You can build your own." plus a docs link.
- `Create.tsx`: render `FunctionCatalog` in a second `CardLayout`. Order it by `provider.preConfigured`. The heading shows counts ("42 actions · 8 syncs").
- Test: one shared-app provider, one without, one with zero templates. Check the layout at the 968px minimum width with the panel open.

### PR 4: `feat(webapp): add "Set up later" to integration create forms`
- `CreateActions({ provider, loading, onSetupLater })`: renders "Create" as today, plus a secondary "Set up later" `Button`. Layout goes on a wrapper div, not the Button. "Set up later" calls `onSubmit({ provider: provider.name, useSharedCredentials: false })` and skips `form.handleSubmit`.
- Use it in: the OAuth custom tab (only when there's no shared app), the AppAuth custom tab (same rule), `CustomAuthCreateForm` and `InstallPluginAuthCreateForm`. Leave out: `DefaultCreateForm`, `CustomIntegrationCreateForm`, `McpOAuthCreateForm` (static registration fails, dynamic needs no input) and `McpGenericCreateForm` (nothing required).
- `packages/webapp/src/pages/Integrations/Create.tsx:48`: `const tab = data.auth ? 'settings' : 'functions'`.
- `providerConfigKey/Show.tsx`: when `integration.missing_fields.length > 0`, show `Alert variant="warning"` above the tabs: "This integration can't create connections until you add its credentials." plus a link to `settings`.
- Test:
  - "Set up later" on salesforce → Functions → banner → enable a function → Test connection blocks Authorize with the existing message.
  - Fill credentials in Settings → banner disappears.
  - An API-key provider "Create" → lands on Functions.
