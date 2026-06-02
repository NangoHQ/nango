# 🏃 Step 2 — API-different swaps (NAN-5796)

**Live PR deployment:** TBD
**Master branch deployment:** [https://app-development.nango.dev](https://app-development.nango.dev)
Login: `matej+dev@nango.dev`

Each section heading links directly to the relevant page on the PR deployment. Click the heading, verify the items in that section, and tick the Checked box.

Legend: ✅ done · ❌ issue found · — not checked yet

---

## [/dev/logs](https://app-development.nango.dev/dev/logs)

### Tag → v2 Tag

| Location | v1 variant | v2 variant | Checked |
|---|---|---|---|
| StatusTag — success row | `success` | `success` (green feedback token) | — |
| StatusTag — running row | `info` | `info` (brand-blue feedback token) | — |
| StatusTag — failed row | `alert` | `alert` (red feedback token) | — |
| StatusTag — cancelled / timeout / waiting rows | `gray` | `gray` (disabled text, subtle bg) | — |
| LevelTag — error message | `alert` | `alert` (red feedback token) | — |
| LevelTag — info message | `info` | `info` (brand-blue feedback token) | — |
| LevelTag — warn message | `warning` | `warning` (yellow feedback token) | — |
| LevelTag — debug message | `gray` | `gray` (disabled text, subtle bg) | — |
| OperationTag — type label | `neutral` (default) | `neutral` (default, subtle bg + border) | — |
| OperationTag — action icon | `neutral` (default) | `neutral` (default, subtle bg + border) | — |

> Note: text is no longer uppercase (v1 forced `uppercase` CSS; v2 uses normal casing)

### Tooltip

| Location | Notes | Checked |
|---|---|---|
| OperationTag | hover it — tooltip should still appear | — |

---

## [/dev/logs → click any row (operation detail)](https://app-development.nango.dev/dev/logs)

### Tag → v2 Tag

| Location | v1 variant | v2 variant | Checked |
|---|---|---|---|
| Message type column (Message / HTTP) | `neutral` (default) | `neutral` (default) | — |
| Source field (System / User) in message detail | `neutral` (default) | `neutral` (default) | — |

### CopyButton → v2 CopyButton

| Location | Notes | Checked |
|---|---|---|
| Copy link button (top-right of Operation Details panel) | shows link icon; click copies URL; icon swaps to check mark for 1 s | — |

### IntegrationLogo → v2 IntegrationLogo

| Location | Notes | Checked |
|---|---|---|
| ProviderTag (Integration row in operation detail) | small inline logo, no white box, sits flush next to integration name | — |

---

## [/dev/getting-started](https://app-development.nango.dev/dev/getting-started)

### Tag → v2 Tag

| Location | v1 variant | v2 variant | Checked |
|---|---|---|---|
| "Guide 1" label | `neutral` | `neutral` (subtle bg + border) | — |
| "Guide 2" label | `neutral` | `neutral` (subtle bg + border) | — |
| "Guide 3" label | `neutral` | `neutral` (subtle bg + border) | — |
| "Guide 4" label | `neutral` | `neutral` (subtle bg + border) | — |

---

## Any page with MultiLanguageCodeBlock (e.g. Integrations › Functions › one function)

### Tag → v2 Tag

| Location | v1 variant | v2 variant | Checked |
|---|---|---|---|
| Language label (single-snippet, no dropdown shown) | `gray1` | `gray1` (default badge gray) | — |

---

## [/dev/connections/create-legacy](https://app-development.nango.dev/dev/connections/create-legacy)

### SecretInput → v2 SecretInput

| Location | Notes | Checked |
|---|---|---|
| Client ID field (OAUTH2_CC) | toggle visibility; copy button copies value | — |
| Client Secret field (OAUTH2_CC) | toggle visibility; copy button copies value | — |
| Client Certificate field | toggle visibility; copy button copies value | — |
| Private Key field | toggle visibility; copy button copies value | — |
| Username field (BASIC / BILL / SIGNATURE) | toggle visibility; copy button copies value | — |
| Password field (BASIC / BILL / SIGNATURE) | toggle visibility; copy button copies value | — |
| API Key field | toggle visibility; copy button copies value | — |
| Token ID field (TBA) | toggle visibility; copy button copies value | — |
| Token Secret field (TBA) | toggle visibility; copy button copies value | — |
| OAuth Client ID Override (netsuite) | toggle visibility; copy button copies value | — |
| OAuth Client Secret Override (netsuite) | toggle visibility; copy button copies value | — |
| Organization ID field (BILL) | toggle visibility; copy button copies value | — |
| Dev Key field (BILL) | toggle visibility; copy button copies value | — |
| Dynamic credential params (TWO_STEP / JWT) | toggle + copy for each rendered field | — |
| Dynamic assertion option params (TWO_STEP) | toggle + copy for each rendered assertion field | — |
