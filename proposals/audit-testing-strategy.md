# Audit test strategy — reducing integration footprint

**Status:** POC for discussion. Branch `pau/audit-structural-poc` off `master`.

## Problem

The audit-events work is accumulating per-endpoint **integration** tests. Each audit integration
file boots the full testcontainer stack (Postgres + Redis + ClickHouse + Elasticsearch + ActiveMQ)
and pays a ~20s server-import tax before a single assertion runs. Across the five in-flight PRs that
is ~45 new integration tests in 5 files.

Two observations make most of that footprint questionable:

1. **They don't test the write.** The server test harness doesn't migrate the audit ClickHouse table
   (`audit_trail_events` lives in the `usage` DB, created by the usage migration, which the server
   stack doesn't run). Every `audit.record()` call in these tests actually *fails* against ClickHouse
   and is swallowed; the tests pass purely on a `vi.spyOn(audit, 'record')` assertion. The real write
   is covered separately by `packages/audit/lib/store.integration.test.ts`.

2. **So what they really assert is: the middleware builds the right event, run through the real
   HTTP/auth/authz/controller path.** That is two different things glued together — the middleware's
   *logic* (pure) and the middleware's *contract with the route* (wiring/order).

## What each layer can actually guarantee

| concern | best mechanism | needs a stack? |
| --- | --- | --- |
| coverage decision made (opt-in/opt-out) | **type system** — `ApiEndpoint` requires `Audit: AuditPolicy \| NoAudit` | no (compile) |
| policy can't drift from the endpoint | **type system** — `AuditSpec.policy` is typed as `TEndpoint['Audit']` | no (compile) |
| middleware logic (event shape, redaction, outcome, resolve-before-`next`) | **unit test** with a fake req/res | no |
| wiring: audit installed, after auth, before authz | **structural test** over the router table | no* |
| the whole path fires once end-to-end | **1 smoke test** | yes (once) |
| the ClickHouse write | `store.integration.test.ts` | yes (existing) |

The per-endpoint integration tests are paying stack cost to re-prove rows 3–4 for every endpoint.

## The subtlety: decision-completeness ≠ wiring-completeness

The opt-out design guarantees **every endpoint has consciously chosen** to be audited or not — that's
compile-enforced and genuinely valuable. It does **not** guarantee that an opted-in endpoint's
middleware is actually *installed on the route, in the right position*. That link is untyped: the
policy lives on the endpoint type, the wiring happens through raw `router.post(...handlers)`, and the
two never touch. Real proof from this effort: the deploy route was opted-in *and* had its audit
handler defined, but positioned after `withScope`, so 4xx denials weren't recorded — zero compile
error, and only an integration test caught it.

## POC: a structural wiring check + unit logic tests

All of this is in the branch and **runs green as pure unit tests (8/8, ~25ms of assertions, no
containers)**:

- `middleware/auditWiring.ts` — tag markers (`markAudit`/`markAuthz`) + a router-stack walker
  (`collectRoutes`) + two checkers:
  - `auditPositionViolations()` — for every route that has an audit handler, assert it sits after auth
    and before authz.
  - `unwiredAuditSpecs()` — assert every exported audit spec is installed on at least one route.
- `middleware/auditWiring.unit.test.ts` — drives the checkers against synthetic routers and proves
  they bite: a handler placed after authz is flagged ("denials would be lost"), before auth is
  flagged, a defined-but-unwired spec is flagged.
- `middleware/auditable.unit.test.ts` — drives the real `auditable()` middleware with a fake req/res
  (audit client mocked): event shape, variable-name-not-value redaction, 4xx→denied outcome, and
  resolve-before-`next` (a post-`next` mutation of `res.locals` can't change the captured target).

Tagging is minimal: `auditable()`, `can()`, and `withScope()`/`withAnyScope()` mark their returned
handler; `apiAuth`/`webAuth` are exported so the auth boundary is identifiable by reference.

- `middleware/auditWiring.integration.test.ts` — the same two checkers applied to the **real** router
  table (`publicAPI` + `privateApi`). This is one test that validates wiring for *every* audited
  route at once, replacing the per-endpoint "a denied request is still recorded" integration tests.

## What the structural check does and does not close

- ✅ **order** (after auth, before authz) — fully, across every route.
- ✅ **presence: defined-but-unwired** — a spec written but never installed is flagged.
- ❌ **presence: opted-in-but-no-spec** — an endpoint whose type declares a policy but for which no
  spec was ever written. There is no runtime artifact to key off (the policy is a compile-only type),
  so no runtime test can see it. **Only the typed route builder closes this** (see below).

## Test inventory, before → after (done in this PR for the merged first set)

`audit.private.integration.test.ts` went from **8 stack-booting tests → 3**. The five deleted:

- deleted connection, connection update (changed fields), environment variables, webhook URLs →
  moved to `auditable.unit.test.ts` (event shape + redaction, no containers).
- denied member role change → the structural check (denial capture is now a guarantee for every
  audited route, not one asserted per endpoint).

The three kept are the ones a fake req/res cannot honestly reproduce — the target/metadata is resolved
from state a **real controller mutates** (pre-change role, removed-member email) or from a **real authz
rejection** (cross-account). Those assert the middleware's contract with the live stack, not its logic.

Applied across all the audit-events PRs this pattern turns ~45 stack-booting tests into a unit suite +
one structural sweep + the handful of live-stack-contract cases + the existing `store` write test.

## The endgame (separate, larger change): typed route builder

Route registration through a typed builder that reads `TEndpoint['Audit']` and **auto-installs**
`auditable` in the correct slot (and nothing for `NoAudit`) makes presence + order guaranteed **by
construction** — the wrong states become unrepresentable rather than detected. At that point even the
structural test is redundant, and "opted in ⇒ wired ⇒ positioned" is literally true. It's a
cross-cutting change (every route, plus getting the generic variance right), so it's its own piece of
work, not part of the audit-events PRs.

## Open questions for discussion

1. Is per-handler tagging (a symbol marker on `auditable`/`can`/`withScope`) acceptable, or should
   role identification come from somewhere else?
2. The real-route sweep only reads the built router table (no HTTP, no seeding), but importing the
   route graph today eagerly opens a Postgres pool — so it currently has to live in the integration
   project. Worth making route-graph import side-effect-free (it also helps startup), or accept it as
   one integration test?
3. Appetite for the typed route builder as a follow-up — it's the thing that makes "typed ⇒ no
   integration required" actually true instead of mostly-true.
