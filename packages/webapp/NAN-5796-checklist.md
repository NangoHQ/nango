# 🏃 Step 2 — API-different swaps (NAN-5796)

**Live PR deployment:** TBD
**Master branch deployment:** [https://app-development.nango.dev](https://app-development.nango.dev)
Login: `matej+dev@nango.dev`

Each section heading links directly to the relevant page on the PR deployment. Click the heading, verify the items in that section, and tick the Checked box.

Legend: ✅ done · ❌ issue found · — not checked yet

---

## What changed

| Component | v1 source | v2 target | API change |
|---|---|---|---|
| `Tag` | `components/ui/label/Tag` | `components-v2/ui/Tag` | New component — same variant names (`success`, `alert`, `info`, `warning`, `disabled`, `default`, `neutral`) but backed by v2 design tokens. Added `size="sm"` for inline/code-block contexts. Text is now uppercase by default. |
| `CopyButton` | `components/ui/button/CopyButton` | `components-v2/ui/CopyButton` | v2 extended with `iconType?: 'clipboard' \| 'link'`. Tooltip removed; uses Copy→Check icon swap animation instead. |
| `IntegrationLogo` | `components/ui/IntegrationLogo` | `components-v2/patterns/IntegrationLogo` | Props reduced to `provider` + `className`. v2 renders in a styled 32 px container; inline usages pass `className="size-4 p-0 bg-transparent border-transparent"` to strip the box. |
| `SecretInput` | `components/ui/input/SecretInput` | `components-v2/patterns/SecretInput` | `optionalValue` / `setOptionalValue` → standard `value` / `onChange`. `canRead` permission gate added. Refresh button removed. |

---

## [/dev/logs](https://app-development.nango.dev/dev/logs)

### Tag → v2 Tag

| Location | v1 variant | v2 variant | Checked |
|---|---|---|---|
| StatusTag — success row | `success` | `success` (green feedback token) | — |
| StatusTag — running row | `info` | `info` (brand-blue feedback token) | — |
| StatusTag — failed row | `alert` | `alert` (red feedback token) | — |
| StatusTag — cancelled / timeout / waiting rows | `gray` | `disabled` (disabled text, subtle bg) | — |
| LevelTag — error message | `alert` | `alert` (red feedback token) | — |
| LevelTag — info message | `info` | `info` (brand-blue feedback token) | — |
| LevelTag — warn message | `warning` | `warning` (yellow feedback token) | — |
| LevelTag — debug message | `gray` | `disabled` (disabled text, subtle bg) | — |
| OperationTag — type label | `neutral` (default) | `neutral` (default, subtle bg + border) | — |
| OperationTag — action icon | `neutral` (default) | `neutral` (default, subtle bg + border) | — |

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

## /dev/getting-started (self-hosted only)

> `ClassicGettingStarted` only renders when `isCloud = false`. Not reachable on cloud environments (dev API, staging, prod). Test on a local self-hosted instance.

### Tag → v2 Tag

| Location | v1 variant | v2 variant | Checked |
|---|---|---|---|
| "Guide 1" label | `neutral` | `neutral` (subtle bg + border) | ⏳ self-hosted only |
| "Guide 2" label | `neutral` | `neutral` (subtle bg + border) | ⏳ self-hosted only |
| "Guide 3" label | `neutral` | `neutral` (subtle bg + border) | ⏳ self-hosted only |
| "Guide 4" label | `neutral` | `neutral` (subtle bg + border) | ⏳ self-hosted only |

---

## MultiLanguageCodeBlock — Storybook only

> The single-snippet path (tag instead of dropdown) has no live callsite — the only usage (`GettingStarted/SecondStep`) always passes 2 snippets. Verify via **[Storybook → Components v2/UI/MultiLanguageCodeBlock › SingleSnippet](http://localhost:6006/?path=/story/components-v2-ui-multilanguagecodeblock--single-snippet)**.

### Tag → v2 Tag (size="sm")

| Location | v1 variant | v2 variant | Checked |
|---|---|---|---|
| Language label in code block header (single-snippet, no dropdown) | `gray1` | `default` + `size="sm"` | ⏳ Storybook only |

---

## [/dev/connections/create-legacy](https://app-development.nango.dev/dev/connections/create-legacy)

### SecretInput → v2 SecretInput

| Location | Notes | Checked |
|---|---|---|
| API Key field — select **algolia** from the dropdown | toggle visibility; copy button copies value | — |
