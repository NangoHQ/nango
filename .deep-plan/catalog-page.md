# Catalog page

## The problem

New users come in with one provider in mind. They want to know "does Nango cover X, and what can it do?" before learning the product. Today the only place to see a provider's functions is an integration's Functions tab, so you have to create an integration first. Session replays show people searching the Integrations page, getting an empty result, and sometimes leaving.

The goal of this page is discovery: let anyone browse providers and their pre-built functions without creating anything. It doesn't fix the create form. People still freeze there when there's no Nango developer app. That's the next problem.

## Today

- **Provider list:** `GET /api/v1/providers` returns every provider (~1,070) with `preConfigured` (Nango developer app) and categories (`packages/server/lib/controllers/v1/providers/getProviders.ts`). It has no function counts.
- **Provider templates:** `GET /api/v1/providers/:providerConfigKey/templates` returns a provider's syncs and actions without needing an integration (`packages/server/lib/services/provider.service.ts:74`). Nothing in the dashboard calls it yet.
- **Provider picker:** `CreateList.tsx` lists providers and links to `/:env/integrations/create/:provider`. Search covers `displayName` and `name`.
- **Function details:** `FunctionDetailsPanel` needs an `ApiIntegration`, so it can't be reused as-is on a page with no integration.
- **Sidebar:** `packages/webapp/src/layout/AppSidebar/index.tsx`. Routes: `packages/webapp/src/app/router.tsx`.

## After

**Catalog tab** (`/:env/catalog`), top level in the sidebar.

- Search box first, autofocused. Searches `displayName` and `name`, same as the picker today.
- With no query: providers tagged `popular` first, then the rest alphabetically.
- One card per provider: logo, name, "Nango developer app" badge, sync and action counts, "Configured" badge when the env has 1+ integrations for it.

**Provider page** (`/:env/catalog/:provider`).

- Header: logo, name, auth type, Nango developer app badge, docs link.
- "Your configurations": the env's integrations for this provider, each linking to its integration page. A "Set up" button (or "Add another" when there's already one) goes to the existing create form.
- Functions: read-only list of syncs and actions, with a details view.
- No functions: a simple empty state.

**Integrations page:** "Set up new integration" goes to `/:env/catalog`. The Integrations list keeps showing only what's set up. The create form doesn't change.

## Tracking

- Add a `catalog` category to `taxonomy.ts`: "Browsing providers and their pre-built functions".
- Add `catalog:filter_update` (web): `filter: 'search'`, `result_count`, plus `query` only when `result_count` is 0. Insight: how often catalog search finds nothing, and what people look for that we don't have.
- If the provider page reuses the function details view, add an optional property to `functions:function_view` so catalog views can be told apart.
- Everything else comes from what exists: `$pageview` on both routes, `integrations:create_page_view`, `integrations:integration_create`, and the agent tool/proxy call events.

Funnel to build in PostHog: `/catalog` view → `/catalog/:provider` view → `integrations:create_page_view` → `integrations:integration_create` → first real call within 7 days. Baseline before shipping: zero-result rate on `integrations:filter_update`.

## Work

This is a prototype for a demo, so it all lives on one branch. It can be split into PRs later along these lines:

1. **Function counts on the provider list.** Add `sync_count` and `action_count` to each item of `GET /api/v1/providers`, from `flowService.getAllAvailableFlowsAsStandardConfig()` (already in memory). This covers tools-catalog actions too, since they come from the same `flows.zero.json`. Types in `@nangohq/types`.
2. **Catalog tab.** Route, sidebar entry, cards, search, popular-first order, Configured badge. Taxonomy + `catalog:filter_update`.
3. **Provider page.** Header, configurations, functions list from the provider templates endpoint, empty state. A read-only function details view, either by making `integration` optional in `FunctionDetailsPanel` or by pulling out the read-only parts.
4. **Switch the entry point.** "Set up new integration" goes to the catalog. Remove `CreateList.tsx`, or redirect its route to `/catalog`.

Parts 1–3 add a new page and break nothing, so they need no flag. Part 4 is the switch, and the easy one to revert.

## Not in v0

- Category filter, or searching by category
- Splitting API from auth method
- Creating integrations without credentials
- Turning functions on or off from the catalog
- Changes to the create form
- Landing new users on the catalog after signup

## Open questions

- **Duplicate providers.** With one card per provider, the same API with different auth methods shows up several times (e.g. searching "google"). Look at how bad it is once the page is up.
