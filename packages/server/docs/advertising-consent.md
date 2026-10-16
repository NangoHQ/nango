# Signup advertising consent

Local implementation for NAN-7218's Ads handoff. Disabled by default. No Ads destination is enabled by this change.

## Flow

1. The website reads the existing Cookiebot choice. It sends the actual categories and method to `POST /api/v1/advertising-consent`.
2. The server stores that choice and sets an opaque, host-only HttpOnly cookie. Only its hash is stored in the database.
3. Email signup reads the cookie. Google signup saves a reference in the login session and puts only a random nonce in OAuth state. The nonce expires after 30 minutes.
4. A new account gets a consent reference inside its creation transaction. Existing accounts and invitation joins do not get a new binding. Optional storage failures use a savepoint and do not abort account creation.
5. The conversion sender calls `getSignupAdvertisingPermission(accountId)` immediately before dispatch. Null means skip. Do not put a cached permission result in the queue.

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

The lookup requires the actual signup creator to be verified, non-suspended and external. An external teammate cannot authorize a signup created internally. A server-generated signup ID prevents a later organization join from filling a missing creator. The result contains ad context, the original account creation timestamp (`_nango_accounts.created_at`), the recorded choice and revision, and evaluated `adStorage`, `adUserData` and `adPersonalization` states under `cookiebot-regional-marketing-v2`. Platform adapters require a supported click ID and genuine signup browser context. Account creation happens before user creation and email verification, so the sender must defer/recheck pending signups within a bounded window rather than assume an immediate null result is permanent.

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
4. Configure and validate each conversion destination separately before enabling delivery. Keep the existing PostHog Meta test destination disabled to avoid two senders.

## Conversion delivery

The existing server cron checks committed signup bindings once a minute. `signup_ad_conversions` stores one delivery record per account/platform, with its destination, status and receipt. Adapters derive a stable event ID from the account ID. It stores no click IDs, email addresses, browser payloads or credentials. Records survive code rollback to prevent replay and are deleted with their account.

Delivery requires all of: cloud production, consent capture enabled, `SIGNUP_AD_CONVERSIONS_ENABLED=true`, and valid `SIGNUP_AD_CONVERSIONS_CONFIG` server-secret JSON. Both new settings default to disabled/empty. Never put this configuration in frontend variables, source control or logs.

The configuration is an array. Each entry requires `platform` and an explicit UTC `startAt` launch cutoff. Platform fields:

- Meta: `pixelId`, `version`, `token`.
- ChatGPT and Reddit: `pixelId`, `token`. Reddit needs a reviewed conversion token; expired credentials stop delivery.
- X: `pixelId`, `eventId`, `consumerKey`, `consumerSecret`, `accessToken`, `accessTokenSecret`. Use an Ads API-approved OAuth app and an account admin/ad manager user token. The configured event must be the signup event, not a pageview.
- Google: `accountId`, `loginAccountId`, `conversionId`, `clientId`, `clientSecret`, `refreshToken`, with Data Manager access. Google obtains an access token before the final consent check.

X uses the preserved `twclid`, original account creation time and stable `conversion_id`. It requires exactly one processed conversion in the API response. Its signup event and OAuth credentials still need provisioning; the GTM Pixel token is not used by this backend. Microsoft and LinkedIn have no adapters in this release.

Only new accounts after each destination's launch cutoff qualify. There are at most eight sends within 24 hours of account creation, limited further by consent expiry. Verification after that window is excluded. Every send/retry checks current permission; missing permission waits up to the same deadline. Only `https://app.nango.dev/signup` and `/signin` are eligible source URLs. Development, preview and internal creators are excluded.

Google's initial request acknowledgement remains `submitted`. The worker polls its processing result for up to 24 hours after submission, without resending. Known temporary processing failures return to pending after three hours and must pass consent again. Duplicate transaction acknowledgements are terminal `duplicate`; unresolved receipts become `unconfirmed`. Other platforms' `accepted` means transport/ingestion acknowledgement. None of these statuses proves paid attribution.

Tests use mocked ad APIs and disposable local databases. Platform credentials, approved test-mode requests, actual receipt/attribution checks and production enablement remain separate release steps. A real EU visit and first-time Google signup remain deferred live checks.

Adapter contracts: [Google](https://developers.google.com/data-manager/api/reference/rest/v1/requestStatus/retrieve), [ChatGPT](https://developers.openai.com/ads/conversions-api), [Reddit](https://ads-api.reddit.com/docs/v3/guides/programs/capi/direct-integration), [Meta SDK](https://github.com/facebook/facebook-nodejs-business-sdk#conversions-api), [X conversions](https://docs.x.com/x-ads-api/measurement/web-conversions), [X authentication](https://docs.x.com/x-ads-api/fundamentals/making-authenticated-requests).

## Rollback

1. Pause all conversion senders that depend on this feature and stop accepting new conversion jobs. Drain/cancel pending sends before continuing.
2. Disable the website bridge and server flag in their deployments. The permission helper returns null while disabled.
3. Run the explicit `invalidateAdvertisingPermissions()` maintenance operation before re-enabling reporting. It invalidates existing contexts, expires signup bindings and clears click IDs while preserving choices until their original expiry. This prevents old queued signups from becoming eligible again.
4. Roll back code. The migrations' `down` intentionally keep consent and delivery tables. Reapplying the migration is safe.

Keep cleanup operating while records remain. If the feature is permanently retired, remove records through a separate reviewed deletion. Do not treat retained grants as current permission after downtime.

References:

- https://www.cookiebot.com/en/developer/
- https://support.cookiebot.com/hc/en-us/articles/360003782954-Display-the-cookie-consent-banner-to-visitors-from-specific-regions-only-via-the-Cookiebot-Admin
- https://support.cookiebot.com/hc/en-us/articles/8470146709532-Cookiebot-and-the-GPC-signal
