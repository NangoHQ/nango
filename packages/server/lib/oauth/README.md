# Nango OAuth login and consent

The reusable protocol provider is `@nangohq/oauth-server`. This directory supplies the Nango session bridge, React interaction API and product-grant lifecycle. It does **not** enable bearer authentication on `/mcp`.

## Configuration

- Enable `NANGO_MANAGEMENT_MCP_OAUTH_ENABLED` and configure `NANGO_MANAGEMENT_MCP_SERVER_URL`.
- `NANGO_OAUTH_SERVER_BASE_URL` is the issuer origin. Cloud defaults to `https://id.nango.dev`; local/self-hosted installations must configure it explicitly.
- Supply `NANGO_OAUTH_SERVER_COOKIE_KEYS` (JSON array of at least two independent signing keys), `NANGO_OAUTH_SERVER_JWKS` (private signing keys), and the existing encryption-key configuration.
- Enable normal dashboard authentication and the account-targeted Unleash flag `oauth-server-consent` (defaults off). The flag gates the bridge and consent, not provider discovery or token endpoints.
- `NANGO_PUBLIC_SERVER_URL` identifies the exact dashboard origin for credentialed CORS and CSRF Origin checks. The React runtime receives `oauthServerUrl` via `/env.js`, and CSP permits that origin.
- Route the issuer host to the server and preserve `Host` and the trusted HTTPS forwarding information. Protocol endpoints reject other hosts. Do not widen `nango_session` to a parent domain.

The dashboard and issuer must be same-site for the issuer's `SameSite=Lax` cookies to accompany the React API requests (Cloud's `app.nango.dev` and `id.nango.dev` satisfy this). For local cross-origin browser tests, use same-site HTTPS subdomains, not `localhost` versus `127.0.0.1`.

## Security and persistence

An issuer interaction redirects to `/oauth/continue` with opaque state. The dashboard/API session either issues a 45-second handoff code or completes normal login, MFA and onboarding first. The code is hashed server-side, bound to a browser nonce, identity, interaction and exact issuer return destination, and consumed once under a transaction. The resulting issuer cookie is host-only and independent of dashboard logout.

Approval validates the provider interaction, client callback and all configured resources/scopes again, claims the interaction once, and creates a fresh grant. Provider artifacts and the `pending → active` product binding share the same database transaction; failures roll both back. Resource/scopes live in child rows, without an environment allowlist.

Provider revocation/replay and password changes/resets revoke the entire product grant and its provider artifacts. Password changes also delete issuer sessions and outstanding identity-bound handoffs. The user-row lock serializes these operations against approval and bridge issuance/consumption. The existing old-data cron runs a bounded cleanup of expired bridge/session/decision rows and compensates stale pending grants. The migration's empty `down` preserves security state during code rollbacks.

Reads are explicitly non-audited. Approvals, denials, issuer-session establishment and grant revocation have explicit audit policies; credential-bearing URLs and identifiers are not included in audit metadata or errors.

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

Integration tests exercise the real HTTP routes, provider and PostgreSQL, with external CIMD/WorkOS fixtures. Browser component tests cover loading, failures, expiry, mobile layout, keyboard actions, duplicate submission, StrictMode and accessibility in both themes. Full-app HTTPS browser verification can use the production webapp build and separate dashboard/API/issuer hostnames; never use a shared database for disposable fixtures.
