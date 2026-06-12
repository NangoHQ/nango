#!/usr/bin/env bash
# Scan webapp source for usage of removed bridge token CSS variables.
# Run after rebasing on master to catch tokens master may have re-introduced.
#
# Strategy:
#   1. Any direct var(--color-X) reference where --color-X is not defined in the DS.
#   2. Tailwind class names that map to those same removed variables
#      (e.g. bg-bg-surface maps to --color-bg-surface which was removed).
#
# Usage: bash packages/webapp/check-removed-tokens.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/src"
DS_TOKENS="$SCRIPT_DIR/../design-system/tokens/tokens.generated.css"

# ── Step 1: build the set of valid --color-* names from the DS tokens file ─────
valid_color_tokens() {
    grep -E '^\s+--color-[a-z]' "$DS_TOKENS" \
        | sed 's/.*--color-\([a-z0-9-]*\):.*/\1/' \
        | sort -u
}
VALID_DS=$(valid_color_tokens)

# ── Step 2: all bridge token suffixes (--color-<suffix>) ────────────────────────
# Derived from the deleted tokens-bridge.css and tokens-bridge-primitives.css.
ALL_BRIDGE_SUFFIXES=(
    badge-bg-gray badge-bg-mint badge-bg-pink badge-bg-yellow
    badge-fg-gray badge-fg-mint badge-fg-pink badge-fg-yellow
    bg-accent bg-elevated bg-muted bg-subtle bg-success bg-surface
    border-brand border-default border-disabled border-extra-strong border-muted border-strong
    breadcrumb-default breadcrumb-hover breadcrumb-press
    btn-destructive-bg btn-destructive-disabled btn-destructive-fg btn-destructive-hover btn-destructive-loading btn-destructive-press
    btn-primary-bg btn-primary-disabled btn-primary-fg btn-primary-hover btn-primary-loading btn-primary-press
    btn-secondary-bg btn-secondary-disabled btn-secondary-fg btn-secondary-hover btn-secondary-loading btn-secondary-press
    btn-tertiary-bg btn-tertiary-disabled btn-tertiary-fg btn-tertiary-hover btn-tertiary-loading btn-tertiary-press
    dropdown-bg-default dropdown-bg-hover dropdown-bg-press
    feedback-error-alt feedback-error-bg feedback-error-border feedback-error-fg
    feedback-info-alt feedback-info-bg feedback-info-fg
    feedback-neutral-alt feedback-neutral-bg feedback-neutral-fg
    feedback-success-alt feedback-success-bg feedback-success-fg
    feedback-warning-alt feedback-warning-bg feedback-warning-fg
    fg-error
    focus-ring
    icon-brand icon-disabled icon-primary icon-secondary icon-tertiary
    link-default link-disabled link-hover link-press
    nav-bg-hover nav-bg-press
    text-brand text-disabled text-primary text-secondary text-tertiary
    # primitives bridge
    active-gray bg-black bg-dark-blue
    black blue-400 blue-500
    border-blue border-gray border-gray-400
    gray-100 gray-1000 gray-150 gray-200 gray-250 gray-300 gray-400 gray-50
    gray-500 gray-550 gray-600 gray-650 gray-700 gray-75 gray-750 gray-800
    gray-825 gray-850 gray-875 gray-900 gray-950
    grayscale-100 grayscale-1000 grayscale-200 grayscale-300 grayscale-400
    grayscale-500 grayscale-600 grayscale-700 grayscale-800 grayscale-900
    green-500 hover-gray off-black pure-black
    red-300 red-500 red-700
    row-hover text-blue text-light-blue text-light-gray
    white yellow-400 yellow-500
)

# Tailwind v4 built-in color suffixes — present even without the bridge.
# These are safe to use; the bridge was just aliasing them.
TAILWIND_BUILTINS=(
    black white
    slate-50 slate-100 slate-200 slate-300 slate-400 slate-500 slate-600 slate-700 slate-800 slate-900 slate-950
    gray-50 gray-100 gray-200 gray-300 gray-400 gray-500 gray-600 gray-700 gray-800 gray-900 gray-950
    zinc-50 zinc-100 zinc-200 zinc-300 zinc-400 zinc-500 zinc-600 zinc-700 zinc-800 zinc-900 zinc-950
    neutral-50 neutral-100 neutral-200 neutral-300 neutral-400 neutral-500 neutral-600 neutral-700 neutral-800 neutral-900 neutral-950
    stone-50 stone-100 stone-200 stone-300 stone-400 stone-500 stone-600 stone-700 stone-800 stone-900 stone-950
    red-50 red-100 red-200 red-300 red-400 red-500 red-600 red-700 red-800 red-900 red-950
    orange-50 orange-100 orange-200 orange-300 orange-400 orange-500 orange-600 orange-700 orange-800 orange-900 orange-950
    amber-50 amber-100 amber-200 amber-300 amber-400 amber-500 amber-600 amber-700 amber-800 amber-900 amber-950
    yellow-50 yellow-100 yellow-200 yellow-300 yellow-400 yellow-500 yellow-600 yellow-700 yellow-800 yellow-900 yellow-950
    lime-50 lime-100 lime-200 lime-300 lime-400 lime-500 lime-600 lime-700 lime-800 lime-900 lime-950
    green-50 green-100 green-200 green-300 green-400 green-500 green-600 green-700 green-800 green-900 green-950
    emerald-50 emerald-100 emerald-200 emerald-300 emerald-400 emerald-500 emerald-600 emerald-700 emerald-800 emerald-900 emerald-950
    teal-50 teal-100 teal-200 teal-300 teal-400 teal-500 teal-600 teal-700 teal-800 teal-900 teal-950
    cyan-50 cyan-100 cyan-200 cyan-300 cyan-400 cyan-500 cyan-600 cyan-700 cyan-800 cyan-900 cyan-950
    sky-50 sky-100 sky-200 sky-300 sky-400 sky-500 sky-600 sky-700 sky-800 sky-900 sky-950
    blue-50 blue-100 blue-200 blue-300 blue-400 blue-500 blue-600 blue-700 blue-800 blue-900 blue-950
    indigo-50 indigo-100 indigo-200 indigo-300 indigo-400 indigo-500 indigo-600 indigo-700 indigo-800 indigo-900 indigo-950
    violet-50 violet-100 violet-200 violet-300 violet-400 violet-500 violet-600 violet-700 violet-800 violet-900 violet-950
    purple-50 purple-100 purple-200 purple-300 purple-400 purple-500 purple-600 purple-700 purple-800 purple-900 purple-950
    fuchsia-50 fuchsia-100 fuchsia-200 fuchsia-300 fuchsia-400 fuchsia-500 fuchsia-600 fuchsia-700 fuchsia-800 fuchsia-900 fuchsia-950
    pink-50 pink-100 pink-200 pink-300 pink-400 pink-500 pink-600 pink-700 pink-800 pink-900 pink-950
    rose-50 rose-100 rose-200 rose-300 rose-400 rose-500 rose-600 rose-700 rose-800 rose-900 rose-950
)

# ── Step 3: compute truly-removed suffixes ────────────────────────────────────────
TRULY_REMOVED=()
for suffix in "${ALL_BRIDGE_SUFFIXES[@]}"; do
    # Skip if DS provides this exact --color-suffix
    if echo "$VALID_DS" | grep -qx "$suffix"; then
        continue
    fi
    # Skip if it's a Tailwind built-in color
    skip=false
    for builtin in "${TAILWIND_BUILTINS[@]}"; do
        if [[ "$suffix" == "$builtin" ]]; then
            skip=true
            break
        fi
    done
    $skip && continue

    TRULY_REMOVED+=("$suffix")
done

echo "Checking ${#TRULY_REMOVED[@]} truly-removed bridge token suffixes..."
echo ""

found=0

for suffix in "${TRULY_REMOVED[@]}"; do
    # 1. Direct CSS variable reference — most reliable signal
    css_var="--color-${suffix}"
    var_matches=$(grep -rn -- "$css_var" "$SRC_DIR" \
        --include="*.tsx" --include="*.ts" --include="*.css" \
        2>/dev/null || true)

    if [[ -n "$var_matches" ]]; then
        echo "REMOVED CSS VAR: $css_var"
        echo "$var_matches" | head -3
        echo ""
        found=$((found + 1))
    fi

    # 2. Tailwind class: look for any occurrence of "-<suffix>" in TSX/TS source.
    # This catches patterns like bg-bg-elevated, bg-border-brand, text-text-primary, etc.
    # CSS files are covered by the var() check above.
    #
    # Skip class check if a DS token name *ends with* this suffix — searching "-<suffix>"
    # would produce false positives for valid DS classes that embed the suffix.
    # Example: bridge suffix "link-hover" matches "text-text-link-hover" which uses the
    # DS token --color-text-link-hover, not the removed --color-link-hover.
    if echo "$VALID_DS" | grep -q "${suffix}$"; then
        continue
    fi

    escaped="${suffix//./\\.}"
    class_matches=$(grep -rn -- "-${escaped}" "$SRC_DIR" \
        --include="*.tsx" --include="*.ts" \
        2>/dev/null | grep -v "^\s*//" | grep -v "//[[:space:]]" || true)

    if [[ -n "$class_matches" ]]; then
        echo "REMOVED CLASS SUFFIX: -${suffix}"
        echo "$class_matches" | head -3
        echo ""
        found=$((found + 1))
    fi
done

echo "---"
if [[ $found -eq 0 ]]; then
    echo "✓ No removed bridge tokens found in webapp source."
else
    echo "✗ Found ${found} hit(s) for removed tokens. Fix before merging."
    exit 1
fi
