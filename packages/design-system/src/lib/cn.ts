import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import type { ClassValue } from 'clsx';

/**
 * Merges Tailwind CSS class names, resolving conflicts so the last value wins.
 *
 * Uses `clsx` for conditional/array syntax and `tailwind-merge` to deduplicate
 * conflicting utilities (e.g. `cn('h-8', 'h-10')` → `'h-10'` instead of `'h-8 h-10'`).
 *
 * Extended with custom class groups for our `@theme` tokens so tailwind-merge assigns
 * them to the right conflict group. Without these, it either puts them in the wrong group
 * (false conflicts) or treats them as unknown (no dedup):
 *
 * - `text-ds-*`    → font-size   (not color — avoids conflict with `text-button-*`)
 * - `font-ds-*`    → font-weight (not font-family — avoids conflict with `font-sans`)
 * - `border-ds-*`  → border-width
 * - `rounded-ds-*` → border-radius
 * - `leading-ds-*` → line-height
 * - `tracking-ds-*`→ letter-spacing
 * - `shadow-focus-*` / `shadow-container-*`  → shadow
 */

const isAny = () => true;

const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            'font-size': [{ 'text-ds': ['3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'] }],
            'font-weight': [{ 'font-ds': ['regular', 'medium', 'semibold', 'bold'] }],
            'border-w': [{ 'border-ds': ['0', '1', '2', 'hairline'] }],
            rounded: [{ 'rounded-ds': ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full'] }],
            leading: [{ 'leading-ds': ['tight', 'snug', 'normal', 'relaxed'] }],
            tracking: [{ 'tracking-ds': ['tight', 'normal', 'wide'] }],
            // Prefix-based so new DS shadow tokens are picked up without editing this file
            shadow: [{ 'shadow-focus': [isAny] }, { 'shadow-container': [isAny] }]
        }
    }
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
