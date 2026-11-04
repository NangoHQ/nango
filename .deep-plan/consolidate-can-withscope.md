# Consolidate `can` and `withScope`

`.deep-plan/` can be gitignored; this is a working plan, not a commit.

## The problem

Private routes authorize with `can(scope)` → `principalCan` → `authorize` on a grant-bearing `Principal`. Public routes authorize with `withScope(scope)` → `authorizeApiKey` on `scopes` + `environmentIds`. Same question, two engines, two error bodies, two in-handler helpers (`principalCan` vs `hasAuthorizedScope`).

The grant kernel already knows how to answer for a key (`grantsForKey` + `issuedGrant`). Public middleware never calls it. Every new protected route has to pick a side, and consolidating later means touching every registration twice.

## Today

Two Express helpers, same 403 code, different predicates.

| | Private `/api/v1` | Public `/` |
|---|---|---|
| Auth | `sessionAuth` → `user` + `?env=` | `secretKeyAuth` → `apiKeyPrincipal` + inferred env if exactly one relation |
| Gate | `can(scope)` `packages/server/lib/authz/middleware.ts:7` | `withScope` / `withAnyScope` `packages/server/lib/middleware/scope.middleware.ts:54` |
| Predicate | `authorize(principal, scope, target)` | `authorizeApiKey({ principal, requiredScope, target })` |
| Target | `targetForScope` from scope prefix + `locals.environment` | Same idea, built in `packages/server/lib/middleware/scope.middleware.ts:7` |
| In-handler | `principalCan` | `hasAuthorizedScope` |
| 403 body | `You do not have permission to perform this action` | `Insufficient scope. Required: …` (or `one of:`) |
| Missing env, environment scope | throws `ScopeRequiresEnvironmentError` → 500 | `target` null → 403 |
| Missing principal | throws `MissingPrincipalError` → 500 | 403 |

`grantsForKey` (`packages/server/lib/authz/principal.ts:18`) already maps a key onto two grants (environment selectors × `env:${id}…`, account selectors × `account`), via `issuedGrant` so wildcards cannot reach private scopes. Unit tests cover mixed keys. No public route uses it.

`withAnyScope` exists only on public read paths that accept the plain scope **or** the `_credentials` sibling. Private `can()` is one scope; handlers then call `principalCan` for the credential sibling.

`withEnvironmentTarget` (`packages/server/lib/middleware/scope.middleware.ts:35`) is **not** a grant check. It only asks `canAccessApiKeyTarget` (is this env in `environmentIds`?). Used by six public routes (`/providers`, `/providers/:provider`, `/providers/:provider/templates`, `/v1/*`, sandbox dryrun/deployment result) plus management MCP (`packages/server/lib/routes.management-mcp.ts`). Out of this middleware’s job. Empty `scopes` still pass — ownership without a grant.

Environment on public requests is still inferred in SQL (`cardinality(environment_ids) = 1` in `packages/shared/lib/services/account.service.ts:796`). Multi-env keys authenticate and then fail the environment gate. This plan does not change how that env is chosen.

## After

Authentication resolves a `Principal` onto `locals` (already cached by `principalFor`). Scope-gated routes (`can`, `withScope`, `withAnyScope`) share one helper:

```ts
can(scope: Scope, ...or: Scope[]): RequestHandler
```

It calls `principalCan` for each scope (OR). Target still comes from `targetForScope(scope, accountId, locals.environment)` — **ownership of the env is `authorize` matching `where`**, not the resolver.

In-handler checks use `principalCan` only.

`withEnvironmentTarget` stays on those eight routes and still calls `canAccessApiKeyTarget`. After this stack there is one grant helper for scoped routes, and a second Express gate (old engine, no scope argument) for ownership-without-a-grant. Do not fold it: `grantsForKey` drops empty-`can` grants, so “any grant reaches this env” would 403 keys that today pass with empty `scopes`.

Public 403 copy is the contract we keep: it names the required scope(s). Private `/api/v1` adopts that copy (`can` is shared). `code` stays `forbidden`. Dashboard users never see the JSON.

Missing principal or an environment scope with no `locals.environment` stays a **wiring / client-input** failure, not “insufficient scope”. Both throws are **caught in `can()`** so they never reach `errorManager.handleGenericError` (`packages/server/lib/routes.ts:74` → Datadog APM error tag + `generic_error_support` UUID):

- No principal after auth → 500 `{ code: 'missing_principal' }`, same status as private today. Public today 403s this case; it is unreachable (`connectSessionOrPublicAuth` is the auth that does not set `apiKeyPrincipal`, and none of those routes have `withScope`). Catch it anyway — nothing enforces that `can()` only sits after auth that sets a principal.
- Environment scope, no environment → **400** `missing_environment`, not 403. Shared `can()`, so this is also a private change: a private environment-scoped route that somehow has no env goes from 500 to 400. Well-wired private routes already get env from `fillLocalsFromSession`. Today public disguises this as insufficient scope. Single-env keys still infer in auth, so existing public clients are unchanged.

`resolveEnvironment` is a **separate** middleware on environment-scoped public routes (and `withEnvironmentTarget` routes). It does not check `environmentIds`. This stack ships it as the slot in the pipeline, not as a new way to pick the env:

```
apiAuth → resolveEnvironment → can(scope…) → handler
```

Both branches call `next()`. `envAuth` does **not** guarantee `locals.environment` is set; multi-env keys still arrive with nothing, and `can('environment:…')` already 400s on a missing env after PR 1. The slot’s job here is to classify env-scoped vs account-scoped registrations so a later fill of the TODO does not re-touch ~50 routes. A `TODO` in that function is where a later change would resolve a client-supplied env (header, or whatever we pick). Account-scoped `can('account:…')` does not use `resolveEnvironment`.

## What will look different in the codebase

- `packages/server/lib/authz/middleware.ts` — `can` accepts rest/OR; 403 names scopes; maps `ScopeRequiresEnvironmentError` to 400 and `MissingPrincipalError` to 500 (caught, not thrown).
- `packages/server/lib/authz/principal.ts` — drop the stale `buildPrincipal` doc comment (“the key path compares against the legacy answer and counts”). No such comparison exists.
- `packages/server/lib/routes.public.ts` — `withScope(x)` → `can(x)`, `withAnyScope(a, b)` → `can(a, b)`; environment-scoped bundles become `[...apiAuth, resolveEnvironment, can(…)]`.
- `packages/server/lib/routes.management-mcp.ts` — wrap the two `/mcp` `withEnvironmentTarget` routes in `envAuth` the same way.
- `packages/server/lib/routes.private.ts` — import stays `can`; 403 body names the scope; a missing env on an environment-scoped `can()` is 400 instead of 500.
- Handlers: `hasAuthorizedScope` → `principalCan` (`getPublicConnection`, `getPublicIntegration`, `postPublicEnvironment`, `config.controller`, `allPublicV1`).
- `packages/server/lib/middleware/scope.middleware.ts` — `withScope` / `withAnyScope` / `hasAuthorizedScope` deleted. `withEnvironmentTarget` remains (still ownership-without-a-scope, still `canAccessApiKeyTarget`); it runs after `resolveEnvironment` on those routes.
- `packages/utils/lib/api-key-authorization.ts` — `authorizeApiKey` leaves the public hot path. `hasApiKeyScope` stays for sandbox token minting and MCP tool bodies (not this stack).
- New: `resolveEnvironment` — pass-through of the inferred env + `TODO` for client-supplied resolution. Auth SQL keeps inferring the single-env row.
- Tests: `scope.middleware.unit.test.ts` becomes `can` tests (or moves next to `principal.unit.test.ts`); public integration tests keep asserting `Insufficient scope. Required: …` / `Insufficient scope. Required one of: …`.

## What deliberately does not change

- **No `Nango-Environment` header (or any other client-supplied env) in this stack.** Inference stays in auth SQL. The TODO in `resolveEnvironment` is the only trace of that follow-up.
- Grant storage. Keys still persist `scopes` + `customer_keys_relations`; `grantsForKey` remains the in-memory map.
- Product split: create/update still refuses mixed account/environment selectors and still writes at most one env relation.
- `withEnvironmentTarget` semantics (no specific grant; empty `scopes` still pass; still `canAccessApiKeyTarget`).
- MCP tool-level `hasApiKeyScope` (not Express). Follow-up: pass `locals` and `principalCan`.
- Connect-session-only routes (`/connect/session`) that never had `withScope`.
- Private `?env=` resolution in `fillLocalsFromSession`.
- Dashboard `usePermissions` — already `authorizeIn`.
- `issuedGrant` / private vs issuable scope catalogs.

## Approach — and what we rejected

**One `can()` that calls `authorize`.** Auth already has enough to build the principal (`apiKeyPrincipal` or `user`). Public scoped routes do not keep a parallel predicate. `withEnvironmentTarget` is the leftover second gate, on purpose.

Rejected: **`withScope` as a thin alias that still calls `authorizeApiKey`.** Same registrations, two engines, `grantsForKey` still idle. The surprise later is “we renamed it.”

Rejected: **folding `resolveEnvironment` into `can()`.** Account-scoped routes must not require an env. Forgetting resolve on an environment route should be obvious in the registration (`envAuth` vs `apiAuth`) once the TODO is filled. Ownership stays in `authorize`; naming the target stays in resolve — even while resolve is still a pass-through.

Rejected: **shipping a client-supplied env (header or otherwise) in this stack.** That’s a public-contract change. This stack only opens the middleware slot.

Rejected: **changing the public 403 `code` or dropping the scope name from the message.** Clients and a pile of integration tests key off `Insufficient scope. Required:`.

Rejected: **folding `withEnvironmentTarget` into grants.** Empty-scope keys would start 403ing. “Any grant reaches this env” is not the same check.

Rejected: **cutting `resolveEnvironment` because the stub is a no-op.** Behaviorally `envAuth === apiAuth` in this stack. The classification of ~50 routes is the review you want now, not in the follow-up that fills the TODO.

## The stack

| # | PR | What it does | ~diff | Deployable alone? |
|---|---|---|---|---|
| 1 | Public `can()` uses grants | `can` grows OR + named 403; `withScope`/`withAnyScope` become aliases; characterization tests that `principalCan` ≡ `authorizeApiKey` on issuable routes | small/medium | yes to deploy — inference unchanged. This is the engine flip; reverting PR 2 does not restore `authorizeApiKey`. |
| 2 | Mechanical sweep + `resolveEnvironment` slot | Replace public call sites; `hasAuthorizedScope` → `principalCan`; add pass-through `resolveEnvironment` with a TODO; `envAuth` vs `apiAuth` | medium, mostly mechanical | yes |

PR 1 is the only behavioral authz change. PR 2 is unreadable if mixed with PR 1, but it *does* include the new middleware so environment-scoped registrations already show the final pipeline. The alias in PR 1 is review ergonomics (keep the mechanical sweep out of the engine PR), not rollback safety.

## Migration and deploy order

Nothing persisted. Revert any PR by rolling the server. The only way back to `authorizeApiKey` on public routes is reverting PR 1.

PR 1: old and new predicates coexist behind the same registrations (`withScope` → `can`). In flight: Bearer keys, same as today. Wildcard keys are the sensitive case — covered by the characterization tests before merge.

PR 2: `resolveEnvironment` does not change which env is on `locals`. Single-env keys still work with no client hint.

No flag. No point of no return beyond “we deployed a 403 message change on private” (same `code`) and “environment-scoped missing env is 400 on both surfaces.”

## Risks and the point of no return

**Wildcard equivalence.** `authorizeApiKey` matches `:*` at check time; `issuedGrant` expands onto issuable scopes first. For every public route’s `CustomerKeyScope` these should agree. If they don’t, PR 1 is a silent authz change. The characterization test is the merge gate, not a follow-up.

Create/update already reject mixed or unknown selectors (`isEnvironmentScopeSelector` in `packages/server/lib/controllers/v1/environment/createApiKey.ts:15`, `isAccountScopeSelector` in `packages/shared/lib/services/customerKey.service.ts:134`). The stored selector space is finite and enumerable, which is why an exhaustive unit test is stronger here than a prod shadow-compare.

**`principalCan` throw vs 403.** Public environment routes still get `locals.environment` from single-env inference. Map `ScopeRequiresEnvironmentError` to 400 and `MissingPrincipalError` to 500 **inside `can()`** so neither is a Datadog-tagged unhandled error and a missing target is not dressed up as insufficient scope.

**Connect-session synthetic principal** (`scopes: ['environment:integrations:list']` in `packages/server/lib/middleware/access.middleware.ts:508`). `grantsForKey` will issue that one scope on that one env. `can('environment:integrations:list', 'environment:integrations:list_credentials')` still passes. Do not expand this session to `environment:*`.

There is no data migration. The irreversible step does not exist.

## Appendix — per PR

### PR 1: `feat(authz): authorize public routes through grants`

**Do**

- Extend `can(...scopes: Scope[])` to OR. 403 message: one scope → `Insufficient scope. Required: ${scope}`; several → `Insufficient scope. Required one of: a or b`.
- Catch `ScopeRequiresEnvironmentError` → 400 `{ code: 'missing_environment' }`. Catch `MissingPrincipalError` → 500 `{ code: 'missing_principal' }`. Do not let either throw reach `handleGenericError`.
- `export const withScope = can;` and `withAnyScope = can` (same function) so `routes.public.ts` compiles unchanged. This is not a type identity: `withScope` took `CustomerKeyScope` (wildcards in, no private); `can` takes `Scope` (private in, no wildcards as the required argument). Current call sites are concrete issuable scopes, so it compiles. `can('environment:settings:read_secret')` becomes type-legal on a public route; `issuedGrant` still will not grant it to a key. Do not pass private scopes on public routes.
- Drop the stale `buildPrincipal` comment in `packages/server/lib/authz/principal.ts`.
- Add tests next to `packages/server/lib/authz/principal.unit.test.ts` that `principalCan` and `authorizeApiKey` agree on every `ISSUABLE_SCOPES` value against env and account targets. Fixtures:
  - synthetic: concrete scope, `environment:*`, `environment:integrations:*`, account key, wrong env id, empty `scopes`, empty `environmentIds`, `scopes: ['account:*']` asked for an `environment:` scope
  - production shapes: `env_var` / `api_secret` (`['environment:*']`, `packages/shared/lib/services/account.service.ts:405` and `:1043`), `sandbox_token` (parent ∪ purpose base), `connect_session` (single scope), `customer_key`
- Run existing `scopeEnforcement.integration.test.ts` and `scope.middleware.unit.test.ts` against the alias.

**Don’t**

- Touch route lists beyond the alias.
- Add `resolveEnvironment`.
- Delete `authorizeApiKey`.

**Verify**

- Public 403 bodies unchanged (`Insufficient scope. Required: …` / `Insufficient scope. Required one of: …`).
- Private still 403s on denied roles (`packages/server/lib/authz/authz.integration.test.ts`). Update tests that snapshot the old permission sentence.
- Private environment-scoped `can()` with no env is 400 `missing_environment`, not 500.

### PR 2: `refactor(authz): replace withScope with can`

**Do**

- `routes.public.ts`: `can(...)` everywhere `withScope`/`withAnyScope` were.
- Handlers listed above: `principalCan`.
- Delete `withScope`, `withAnyScope`, `hasAuthorizedScope`. Keep `withEnvironmentTarget`.
- Point `functionCompileAuth` etc. at `can`.
- Add `resolveEnvironment`: if `locals.environment` is already set, `next()`. Otherwise leave it unset and `next()`. Put a `TODO` in the empty branch: this is where client-supplied env resolution will go (header or otherwise); do not check key ownership here — `can` / `authorize` owns `where`. Do not invent an env.
- `const envAuth = [...apiAuth, resolveEnvironment]`. Use on every public route whose `can()` argument is `environment:…`, and on `withEnvironmentTarget` routes (including `packages/server/lib/routes.management-mcp.ts`). Account `can('account:…')` stays `apiAuth` only. Same for `connectSessionOrApiAuth` environment routes: resolve after auth, then `can` / `withEnvironmentTarget`.

**Don’t**

- Read a header, query param, or path segment to pick the env.
- Change auth SQL inference.
- Add a write path for a second `customer_keys_relations` row.

**Verify**

- Existing public tests pass (single-env key, no extra client hint).
- Account routes still work with no environment on locals.
- A forgotten `resolveEnvironment` on an environment handler still 500s in `requireEnvironment` if the handler uses `asyncWrapperWithEnvironment` and auth did not infer — that’s still a wiring bug. `can('environment:…')` 400s first if the handler is `can()`-gated.
