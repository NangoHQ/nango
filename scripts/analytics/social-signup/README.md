# X/Reddit signup conversion proposal

Drafts depend on Google backend #8017 and website #168. All new capture flags and Reddit delivery remain off. X capture/event fields are implemented here; the OAuth sender requires a separate backend adapter draft. No destination was saved, credentials provisioned, platform settings changed or conversions sent.

## Event and consent contract

The existing committed `auth:account_create` is the signup, before email verification. Invites and returning logins do not create another account event. The server adds creator classification using the canonical internal-email predicate; browser metadata cannot supply identity. Senders must require external creator, matching `account-<company>` identity, server origin and no conflicting internal group classification.

Independent X/Reddit cookies collect only genuine `twclid` / `rdt_cid` URL parameters and their original observation times. They reuse the Cookiebot marketing/GPC/regional-choice runner. No UTM inference or email/IP/phone fallback. Both explicit choice and resolved non-opt-in regional defaults can qualify; analytics consent alone cannot. Invalid optional context never blocks signup.

The deliberate V1 cookie/click freshness limit is 24 hours, separate from platform attribution windows. Direct/repeat visits do not refresh click age. Withdrawal/GPC clears the browser cookie and a later acceptance does not resurrect the landing click. **Consent is the browser-reported signup-time snapshot. Later withdrawal cannot cancel already queued delivery/retries.** Acceptance of that limitation for X/Reddit remains an enablement decision.

## Reddit sender

`reddit-config.mjs` exports an **unsaved** destination with `enabled:false`, `deliveryApproved:false`, `dryRun:true`. Required `pixelId`, `startAt` and encrypted `accessToken` have no placeholder defaults; PostHog requires them even when disabled. `testId` is optional, never a default production identifier. Do not provision inputs without approval.

The sender uses CAPI v3, one event per request, original epoch-millisecond signup time, click-only matching, `WEBSITE`, and `metadata.conversion_id = nango:account_create:<company>`. It caps delivery/retries at 48 hours because Reddit documents two days for proper deduplication. This is not an exactly-once guarantee. PostHog owns retry scheduling; actual HTTP retry behavior, transport redaction and platform dedup remain to be verified. HTTP/body errors are sanitized; success requires the documented one-event receipt. Receipt acceptance does not prove attribution.

The event is `CUSTOM / NangoAccountCreate`. Ads' Oct23 read confirmed pixel `a2_jtoex92n06ma` already has a URL-rule `SIGN_UP` for `app.nango.dev/signup`, which measures a page visit. That rule remains untouched. Validate custom-event reporting and conversion-goal/optimization eligibility before enabling, without changing campaigns implicitly.

Before rollout: review/merge dependencies, approve the consent limitation, obtain approved pixel-scoped CAPI access, validate token permissions/terms, configure a dedicated completed-account goal, verify Event Testing/receipt/reporting under separate authorization, then set a fresh cutoff. No backfill. Deploy backend before website, keep delivery off during capture checks. Set independent matching `SIGNUP_{X,REDDIT}_CONTEXT_ENABLED` / `PUBLIC_SIGNUP_{X,REDDIT}_CONTEXT_ENABLED` and explicit `*_COOKIE_NAME` values unique across platforms and Dev/Prod. Disable capture flags and destination independently to roll back.

## X boundary

Official custom CAPI uses OAuth1.0a and an existing pixel/signup event ID. The official GTM `X-Pixel-Token` path is not assumed valid for custom PostHog delivery. Oct23's complete PostHog catalog (309 templates) has no X/Twitter destination, and Hog documents no HMAC-SHA1 signing primitive. Backend already uses `oauth-1.0a` and Node crypto; a separately reviewed, route-scoped adapter can reuse that pattern, with PostHog owning retries. Current X event inventory and API entitlement are unverified (Ads UI reporting returned 403; pixel `rh471` is historical evidence). Capture support alone is not end-to-end readiness.

## Verification and references

Browser tests: `node --import tsx --test tests/signup-*.test.ts` in the website. Backend uses scoped unit/catalogue/env tests, `npm run ts-build`, lint and signup/managed-auth integration tests. `node scripts/analytics/social-signup/mock-tests.mjs generate <existing-function-id>` produces unsaved fixtures with every HTTP call replaced; run through PostHog's mocked test-invocation endpoint, save results, then `node scripts/analytics/social-signup/mock-tests.mjs verify <results>`. These tests exercise real Hog control flow and exact payloads, not credentials, live transport or retry scheduling.

- [Reddit v3 contract](https://ads-api.reddit.com/docs/v3/operations/Post%20Conversion%20Events), [direct integration/dedup](https://ads-api.reddit.com/docs/v3/guides/programs/capi/direct-integration), [Event Testing](https://ads-api.reddit.com/docs/v3/guides/programs/capi/verify-events).
- [X custom conversions](https://docs.x.com/x-ads-api/measurement/web-conversions), [GTM-specific token path](https://docs.x.com/x-ads-api/measurement/gtm-server-side).
- [Hog standard library](https://posthog.com/docs/hog#hogs-standard-library).
