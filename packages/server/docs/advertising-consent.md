# Signup advertising consent

Local implementation for NAN-7218's Ads handoff. Disabled by default. No Ads destination is enabled by this change.

## Flow

1. The website reads the existing Cookiebot choice. It sends the actual categories and method to `POST /api/v1/advertising-consent`.
2. The server stores that choice and sets an opaque, host-only HttpOnly cookie. Only its hash is stored in the database.
3. Email signup reads the cookie. Google signup saves a reference in the login session and puts only a random nonce in OAuth state. The nonce expires after 30 minutes.
4. A new account gets a consent reference inside its creation transaction. Existing accounts and invitation joins do not get a new binding. Optional storage failures use a savepoint and do not abort account creation.
5. A conversion sender must call `getSignupAdvertisingPermission(accountId)` immediately before dispatch. Null means skip. Do not put a cached permission result in the queue.

This leaves the existing PostHog events and acquisition properties unchanged. It does not collect all visits or replace the attribution timeline.

## What is stored

- `advertising_consents`: latest browser-reported choice, revision, observation time, expiry, owner hash and bounded ad click IDs.
- `signup_advertising_consents`: account reference, exact signup creator, consent revision, signup-time ad context and expiry.

Ad context is separate for Google, Meta, Microsoft, ChatGPT (`oppref`), X (`twclid`) and Reddit (`rdt_cid`). A later Google touch replaces the whole earlier Google identifier group, so an old `gclid` cannot be combined with a newer `wbraid`. Each touch carries its server observation time and `landing_query` source. Returning with no new click ID preserves the prior touch; this is not a visit history.

The signup snapshot also holds a bounded browser user-agent and source URL built from the allowed app origin and reported `/signup` or `/signin` route. Queries, fragments and token paths are excluded. Google carries this context from initiation through the server session, not from the callback. Missing context stays missing; adapters must check their required fields. Withdrawal clears it with the click IDs. Existing records need no migration.

The choice is browser-reported, not independently verified proof of a banner interaction. `observed_at` is when our server received it, not when the person originally chose it. This is a current-state record, not a full consent history.

Om approved replacing the global explicit-only rule on October 14. Eligibility follows the existing Cookiebot regional configuration:

- Explicit Marketing permission is eligible unless GPC is present.
- An implied Marketing state is eligible when Cookiebot reports `gdprApplies=false`, `lgpdApplies=false` and a known CCPA flag. This supports regional defaults, including US visitors who are not asked to click Accept. It does not relabel that state as an explicit user choice.
- Missing regional flags cannot authorize implied permission. Implied states in an opt-in region, Marketing rejection, withdrawal and GPC are ineligible. The website reads `navigator.globalPrivacyControl`; the API also honors `Sec-GPC: 1` over a conflicting body.

The helper returns `basis: explicit | regional_default` and mapping version `cookiebot-regional-marketing-v2`. Regional flags are CMP-reported evidence, not verified geography or a complete legal rules engine. The resolved Marketing state remains required; merely being outside the GDPR region does not grant permission. No banner, regional admin setting or existing PostHog behavior is changed. This route suppresses sends on GPC; it does not implement platform-specific restricted measurement for opted-out users.

The lookup requires the actual signup creator to be verified, non-suspended and external. An external teammate cannot authorize a signup created internally. A server-generated signup ID prevents a later organization join from filling a missing creator. The result contains ad context, the original signup timestamp, the recorded choice and revision, and evaluated `adStorage`, `adUserData` and `adPersonalization` states under `cookiebot-regional-marketing-v2`. Platform adapters remain responsible for event identity, deduplication, platform requirements and whether a supported matching ID is present. Account creation happens before user creation and email verification, so the sender must defer/recheck pending signups within a bounded window rather than assume an immediate null result is permanent.

## Withdrawal and failure behavior

A changed choice increments the revision and clears stored ad IDs, including signup snapshots. A later grant cannot revive that old signup. A stale tab cannot replace a newer revision with its old grant. Denials can always reduce permission.

Reposting an unchanged expired grant is rejected, even with its current revision or a new ad click. The current API cannot distinguish a fresh acceptance of identical categories from an ordinary visit, so it does not renew that grant. A changed CMP choice can create a new revision; it never revives an old signup binding.

The website listens for CMP events and checks local CMP state once per second because Cookiebot has no documented dedicated withdrawal event. Unchanged state sends no request. Failed writes retry the current choice with bounded backoff; a conflicting grant is not retried automatically.

Withdrawal is effective on the server once the update arrives. Offline browsers, cleared cookies, blocked requests and other devices can prevent that link. This does not retract conversions already delivered. Test actual CMP behavior before enabling senders; do not claim universal or instantaneous revocation.

## Configuration and release checks

Server:

- `ADVERTISING_CONSENT_ENABLED=true` only when ready to test/enable.
- `ADVERTISING_CONSENT_ORIGINS` is a comma-separated list of exact website origins. No wildcard, path or trailing slash. HTTPS is required except localhost in local mode.
- `ADVERTISING_CONSENT_LIFETIME_DAYS` must be explicitly chosen, from 1 to 365. There is no production default. This is a context lifetime, not Cookiebot's banner expiry or a statement of retention policy.

Website:

- `PUBLIC_ADVERTISING_CONSENT_ENABLED=true`
- `PUBLIC_ADVERTISING_CONSENT_API_ORIGIN` must be the same origin the app actually uses for signup requests (`dashboardApiUrl`). For a same-origin dashboard API, use the app/preview origin, not a different API hostname. The host-only cookie will not cross those hosts.

The signup request and Google callback must also use the same origin, because the continuation lives in a host-only login session. A split between a dashboard proxy and another callback host is not supported by this implementation. Verify actual `dashboardApiUrl` and callback routing before enabling; do not broaden authentication cookie scope to work around it.

Both environments must use the same site for the credentialed cookie handoff. Cross-site previews and blocked cookies should produce an unattributed signup, not an account-creation error. The dedicated route is mounted before the private API router; the ordinary private API CORS policy is unchanged.

Before release:

1. Run the database integration tests in a Docker-capable environment. They cover withdrawal, stale writes, rollback, savepoint failure, eligibility and cleanup.
2. Choose the lifetime and arrange periodic `deleteExpiredAdvertisingConsents(new Date())` maintenance. Ordinary visits do not extend the existing context expiry. Expiry blocks sends immediately; physical deletion requires this maintenance.
3. Coordinate shared Dev use in engineering. Verify accept, reject, withdraw, repeat visit, email signup and Google signup with the actual CMP and matching API host. Include a US regional default without a banner click, an opt-in region before/after acceptance, GPC and a regional change, plus email verification, an invitation and an existing organization. Confirm the actual CMP supplies the documented regional flags before interpreting a US runtime as eligible.
4. Connect the Ads sender to the permission helper and verify its disabled/error paths. This change does not add a queue or sender.

## Local verification, October 15

The review fixes pass 65 targeted unit/API tests covering consent policy, session continuation, Google redirect destinations, OAuth state, existing acquisition behavior and API boundaries. The website bridge previously passed 10 tests plus website typecheck and lint and is unchanged in this revision.

All 13 database integration tests passed on October 15 using disposable local Docker services. They cover withdrawal, expired-grant replay, parsed enable settings, regional defaults/GPC, retained rollback bindings, exact creator binding, internal creators, verification timing, savepoint failure and cleanup. The run completed in 24.47 seconds, including service startup.

Docker provides 10 CPUs and about 8 GB of memory. The test command used the existing user socket through command-scoped `DOCKER_HOST` and `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE`; no global socket or shell configuration was changed. No Dev or production database was used. Draft PRs are open; the feature is not enabled. Next: coordinate Dev testing with the actual CMP and supported host routing.

## Rollback

1. Pause all conversion senders that depend on this feature and stop accepting new conversion jobs. Drain/cancel pending sends before continuing.
2. Disable the website bridge and server flag in their deployments. The permission helper returns null while disabled.
3. Run the explicit `invalidateAdvertisingPermissions()` maintenance operation before re-enabling reporting. It invalidates existing contexts, expires signup bindings and clears click IDs while preserving choices until their original expiry. This prevents old queued signups from becoming eligible again.
4. Roll back code. The migration's `down` intentionally keeps both tables. Reapplying the migration is safe.

Keep cleanup operating while records remain. If the feature is permanently retired, remove records through a separate reviewed deletion. Do not treat retained grants as current permission after downtime.

References:

- https://www.cookiebot.com/en/developer/
- https://support.cookiebot.com/hc/en-us/articles/360003782954-Display-the-cookie-consent-banner-to-visitors-from-specific-regions-only-via-the-Cookiebot-Admin
- https://support.cookiebot.com/hc/en-us/articles/8470146709532-Cookiebot-and-the-GPC-signal
