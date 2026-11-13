# Google signup conversion proposal

[NAN-7534](https://linear.app/nango/issue/NAN-7534) / [NAN-7683](https://linear.app/nango/issue/NAN-7683). Google only; sender remains disabled. Website #168 is already merged; shared-context capture needs the follow-up website PR. No deployed flags, Ads settings or saved destinations change here.

## Shared context and rollout

One existing `SIGNUP_AD_CONTEXT_COOKIE_NAME` cookie carries one current consent snapshot, independently timed Meta/ChatGPT clicks and an optional `google: {clickType, clickId, clickAt}`. One consent parser applies marketing, regional-default, GPC and 24-hour choice/click freshness checks. Invalid optional clicks cannot discard other networks. Unknown fields are stripped; missing/unknown envelope versions fail closed without blocking signup.

Readers always accept versions 1 and 2. `SIGNUP_AD_CONTEXT_VERSION` controls server emission; `PUBLIC_SIGNUP_AD_CONTEXT_VERSION` controls website writes. Both default to `1` and use the existing shared enabled/name settings. No Google cookie, parser, consent timestamp or per-network capture flag remains.

| Website writes | Server emission capability | Result                                          |
| -------------- | -------------------------- | ----------------------------------------------- |
| v1             | 1 or 2                     | Existing Meta/ChatGPT fields                    |
| v2             | 1                          | Existing Meta/ChatGPT fields; Google suppressed |
| v2             | 2                          | Existing fields plus valid Google context       |

Deploy compatible backend readers first with capability 1; verify every serving instance before website version 2 can write. Then separately approve capability 2 on server and website, with matching existing shared cookie names and separate Dev/Prod names. The website remains version 1 during mixed old/new backend rollout. Capture capability does not authorize delivery.

Rollback keeps the compatible reader deployed, restores shared versions to 1, and disables the Google destination. Existing v2 cookies and stale tabs can outlive the flag change; server capability 1 still preserves Meta/ChatGPT. Do not restore the old strict v1 reader until all v2 writers have stopped and v2 cookies are expired, cleared or migrated. Changing flags alone does not prove that condition. Disabling cannot recall sent data or guarantee queued retries stop.

## Event and delivery

Capture one genuine `gclid`, `wbraid` or `gbraid` with original click time, prioritizing in that order when multiple kinds arrive. A new landing replaces the Google click. No email, phone, IP, UTM or profile fallback; no backfill. The 24-hour context lifetime is our V1 restriction, separate from the proposed 30-day action window.

[Cookiebot maps Google's ad user data and personalization to marketing](https://support.cookiebot.com/hc/en-us/articles/12756353963292-About-Google-Consent-Mode). The common explicit-choice/resolved regional-default policy maps both purposes to granted only for valid context. This remains browser-reported consent at signup; later withdrawal may not stop queued sends or retries.

Optional fields attach to committed server `auth:account_create`, before email verification. Invites, returning logins and internal creators do not produce Google conversions. Creator classification uses the canonical server email predicate before the asynchronous company update. The destination also requires matching account identity, production origin, fresh context, a launch cutoff and delivery approval. Original signup time and stable `nango:account_create:<company>` transaction ID survive retries. No new service or database is introduced.

## Remaining setup

The October 26 read-only Ads audit found Om already has direct Admin access to `5335545931`, with no linked manager. The dedicated signup action is missing; Cloud project, approved OAuth client and refresh-token availability are unverified. Do not infer their absence from the native connected-products UI.

1. Approve creating `Nango | Account signup | Server`: `UPLOAD_CLICKS`, category `SIGNUP`, Secondary, MANY/Every, proposed 30-day click window, no monetary value. Read back exclusion from account-default and every custom bidding goal. Preserve demo `6774169181`, historical GA4 `6774121892`, budgets and bidding. [Google action/identifier requirements](https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/send-events), [braid counting constraint](https://developers.google.com/data-manager/api/reference/rest/v1/requestStatus/retrieve), [Secondary custom-goal exception](https://support.google.com/google-ads/answer/11461796).
2. Name an approved Nango Cloud project/owner and verify Data Manager API enablement. Choose an approved user OAuth client with offline `https://www.googleapis.com/auth/datamanager` scope, durable app/refresh lifecycle and reauthorization owner. Om's direct Ads access needs no additional manager grant. Store inputs only in approved encrypted secrets. This Data Manager ingestion route needs no Ads developer token. [Access setup](https://developers.google.com/data-manager/api/devguides/quickstart/set-up-access).
3. Configure `config.mjs` privately: customer and login IDs both `5335545931` for the verified direct-user route, new action ID, approved OAuth inputs, fresh Google UTC launch cutoff. No `linkedAccount`. Required strings must be supplied even for an unsaved disabled invocation; never introduce placeholder production credentials. Keep `enabled=false`, `deliveryApproved=false`, `validateOnly=true` and test exclusions.
4. Separately approve credentialed validation: OAuth lifecycle, both native HTTP continuations, secret redaction and retry behavior. Avoid debugger request dumps with real secrets; dynamically minted access-token redaction is unverified. No universal enhanced-conversion/customer-data-terms prerequisite was established for click-only identifiers. Bring any actual entitlement/terms error to Om before accepting or enabling anything.
5. Approve deployment/capture rollout and delivery separately after review. Assign diagnostics and reauthorization owners. Launch only with an approved fresh cutoff, `deliveryApproved=true` and `validateOnly=false`. Verify first genuine eligible signup processing and Ads receipt. No synthetic live conversions.

## Diagnostics and verification limits

Fixed endpoints: OAuth token refresh, `events:ingest`, and manual `requestStatus:retrieve`. Source logs contain stage/status, allowlisted reason codes and opaque request IDs, without raw errors or payloads. Refresh/ingest failures occur downstream in PostHog and cannot block signup.

Acceptance is not processing or attribution. Run `configuration(true)` only as an approved manual diagnostics read: it never resends. PROCESSING requires a later read; FAILED/PARTIAL_SUCCESS expose allowlisted reasons, with duplicate-transaction-only errors distinguished. Validation-only requests have no processing diagnostics. Google documents transaction-ID deduplication, but no retention duration or exactly-once guarantee was established. No local delivery ledger is added.

Local and unsaved mock tests cover compatibility, consent/freshness, signup retries/invites/returning login, identifiers, payload allowlists, HTTP failures, warnings and processing outcomes. See `mock-tests.mjs` for generation and verification commands. Deterministic tests replace transport in the actual Hog handler; native mocked compilation does not prove real OAuth, delayed retries, matching or receipt. Those remain launch gates.

Reddit/X backend branches remain on hold and untouched. They require rebasing onto this shared-context Google branch before being resumed.
