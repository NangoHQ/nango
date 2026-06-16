import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import type { ClassValue } from 'clsx';

/**
 * Merges Tailwind class names, resolving conflicts so the last value wins
 * (e.g. `cn('h-8', 'h-10')` → `'h-10'`). `clsx` handles conditional/array
 * syntax; `tailwind-merge` deduplicates conflicting utilities.
 *
 * The class groups below teach tailwind-merge about our `@theme` token utilities
 * so it resolves them in the right conflict group instead of mis-grouping them
 * (e.g. `text-ds-*` as a colour) or skipping dedup:
 *
 * - `text-ds-*`     → font-size       (not colour — avoids conflict with `text-*`)
 * - `font-ds-*`     → font-weight     (not font-family — avoids conflict with `font-sans`)
 * - `border-ds-*`   → border-width
 * - `rounded-ds-*`  → border-radius
 * - `leading-ds-*`  → line-height
 * - `tracking-ds-*` → letter-spacing
 * - `shadow-focus-outline-*`, `shadow-container-*` → box-shadow
 */
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            'font-size': [{ 'text-ds': ['3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'] }],
            'font-weight': [{ 'font-ds': ['regular', 'medium', 'semibold', 'bold'] }],
            'border-w': [{ 'border-ds': ['0', '1', '2', 'hairline'] }],
            rounded: [{ 'rounded-ds': ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full'] }],
            leading: [{ 'leading-ds': ['tight', 'snug', 'normal', 'relaxed'] }],
            tracking: [{ 'tracking-ds': ['tight', 'normal', 'wide'] }],
            shadow: [
                'shadow-focus-outline-default',
                'shadow-focus-outline-danger',
                'shadow-container-inset',
                'shadow-container-panel',
                'shadow-container-sheet'
            ]
        }
    }
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
