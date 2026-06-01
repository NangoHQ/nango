# NAN-5796 visual QA checklist

Legend: ✅ done · ❌ issue found · — not checked yet

---

## [/dev/logs](https://app-development.nango.dev/dev/logs)

### Tag (StatusTag, LevelTag, OperationTag)

| Location | Notes | Checked |
|---|---|---|
| StatusTag in operation rows | success=green, running=info-blue, failed=pink/red, cancelled/timeout/waiting=neutral | — |
| LevelTag in message rows | error=pink/red, info=brand-blue, warn=yellow, debug=disabled/muted | — |
| OperationTag type + action tag | neutral variant; tooltip on hover still works | — |

---

## [/dev/logs → click any row (operation detail panel)](https://app-development.nango.dev/dev/logs)

### Tag

| Location | Notes | Checked |
|---|---|---|
| Message type tag (Message / HTTP) in message list | neutral variant | — |
| Source tag (System / User) in message detail | neutral variant | — |

### CopyButton

| Location | Notes | Checked |
|---|---|---|
| Copy link button (top-right of operation detail) | link icon shown; click copies URL; icon swaps to check mark for 1 s | — |

### IntegrationLogo

| Location | Notes | Checked |
|---|---|---|
| ProviderTag in operation detail (Integration row) | small inline logo with no white box, next to integration name | — |

---

## [/dev/getting-started (classic)](https://app-development.nango.dev/dev/getting-started)

### Tag

| Location | Notes | Checked |
|---|---|---|
| "Guide 1–4" labels on each card | neutral variant | — |

---

## Any page with MultiLanguageCodeBlock (e.g. Integrations › Functions › one function)

### Tag

| Location | Notes | Checked |
|---|---|---|
| Language tag (single-snippet case, no dropdown) | gray1 variant — solid gray background, no border | — |

---

## [/dev/connections/create-legacy](https://app-development.nango.dev/dev/connections/create-legacy)

### SecretInput

| Location | Notes | Checked |
|---|---|---|
| Client ID / Client Secret fields (OAUTH2_CC) | toggle visibility works; copy button copies current value | — |
| Client Certificate / Private Key fields | toggle visibility works; copy button works | — |
| Username / Password fields (BASIC / BILL / SIGNATURE) | toggle visibility works; copy button works | — |
| API Key field | toggle visibility works; copy button works | — |
| Token ID / Token Secret fields (TBA) | toggle visibility works; copy button works | — |
| Organization ID / Dev Key fields (BILL) | toggle visibility works; copy button works | — |
| Dynamic credential params (TWO_STEP / JWT) | toggle + copy for each rendered param field | — |
| Dynamic assertion option params (TWO_STEP) | toggle + copy for each rendered assertion field | — |
