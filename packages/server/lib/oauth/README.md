# Nango OAuth login and consent

The reusable protocol provider is `@nangohq/oauth-server`. This directory supplies dashboard-session authentication, the React interaction API and the product-grant lifecycle. It does **not** enable bearer authentication on `/mcp`.

## Configuration

- Enable `NANGO_MANAGEMENT_MCP_OAUTH_ENABLED` and configure `NANGO_MANAGEMENT_MCP_SERVER_URL`.
- `NANGO_OAUTH_SERVER_BASE_URL` is an optional issuer-origin override. It defaults to the browser-facing dashboard API origin (`NANGO_DASHBOARD_API_URL`, falling back to `NANGO_SERVER_URL`). Set it to `https://api.nango.dev` for Cloud. If the dashboard API uses `/`, the origin is `NANGO_PUBLIC_SERVER_URL` and its proxy must also forward the OAuth paths.
- The override must match that API origin; a mismatch fails at startup. Another hostname does not merely require another login: the dashboard's host-only cookie would never reach it. A separate issuer host requires a separate authentication design.
- Supply `NANGO_OAUTH_SERVER_COOKIE_KEYS` (JSON array of at least two independent signing keys), `NANGO_OAUTH_SERVER_JWKS` (private signing keys), and the existing encryption-key configuration.
- Enable normal dashboard authentication and the account-targeted Unleash flag `oauth-server-consent` (defaults off). The flag gates authenticated interactions and consent, not provider discovery or token endpoints.
- `NANGO_PUBLIC_SERVER_URL` identifies the exact dashboard origin for credentialed CORS and CSRF Origin checks. The React runtime receives `oauthServerUrl` via `/env.js`, and CSP permits that origin.
- Route the issuer host to the server and preserve `Host` and the trusted HTTPS forwarding information. Protocol endpoints reject other hosts. Do not widen `nango_session` to a parent domain.

The dashboard and issuer must be same-site for the provider's `SameSite=Lax` cookies to accompany the React API requests (Cloud's `app.nango.dev` and `api.nango.dev` satisfy this). For local cross-origin browser tests, use same-site HTTPS subdomains, not `localhost` versus `127.0.0.1`.

## Security and persistence

OAuth interaction routes load the existing `nango_session` with the same Passport middleware as the dashboard API; protocol/token routes do not load dashboard sessions or parse their bodies through that middleware. Already-signed-in users go directly to React consent. Signed-out users complete normal login, MFA and onboarding first, then a redirect-only React route (`/oauth/continue/:uid`) returns to the exact provider interaction. Only this validated local continuation is stored before login; normal session rotation discards it after authentication. There are no handoff codes, extra login cookies or separate login-session tables.

Approval validates the provider interaction, client callback and all configured resources/scopes again, claims the interaction once, and creates a fresh grant. Provider artifacts and the `pending → active` product binding share the same database transaction; failures roll both back. Resource/scopes live in child rows, without an environment allowlist.

Every new authorization requires explicit consent, even if provider cookies remember an earlier grant. Only the current interaction's approved grant can resume, so remembered provider state cannot bypass dashboard login or the consent flag.

Provider revocation/replay and password changes/resets revoke the entire product grant and its provider artifacts. Approval rechecks the dashboard session under the same user-row lock as password revocation. Dashboard logout requires login for new consent, but does not revoke existing grants or refresh tokens. The existing old-data cron runs bounded cleanup of expired decision rows and compensates stale pending grants. The migration's empty `down` preserves security state during code rollbacks.

Reads are explicitly non-audited. Approvals, denials and grant revocation have explicit audit policies; normal login keeps its existing authentication audit events. Credential-bearing URLs and identifiers are not included in audit metadata or errors.

## Verification

```sh
npm run test:integration -- --run packages/server/lib/oauth/consent.integration.test.ts packages/oauth-server/lib/adapter.integration.test.ts
npm run test:unit -- --run packages/server/lib/oauth/ packages/server/lib/middleware/audit/oauth.middleware.unit.test.ts packages/oauth-server/lib/
npm run test:browser -w packages/webapp
npm run ts-build
npm run webapp-build
npm run lint
npm run format:check
```

Integration tests exercise the real HTTP routes, provider and PostgreSQL, with external CIMD/WorkOS fixtures. Browser component tests cover loading, failures, expiry, mobile layout, keyboard actions, duplicate submission, StrictMode and accessibility in both themes. Full-app HTTPS browser verification uses the production webapp build with separate dashboard and API hostnames, with OAuth on the API host; never use a shared database for disposable fixtures.
