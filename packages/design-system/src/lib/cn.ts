import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import type { ClassValue } from 'clsx';

/**
 * Merges Tailwind CSS class names, resolving conflicts so the last value wins.
 *
 * Uses `clsx` for conditional/array syntax and `tailwind-merge` to deduplicate
 * conflicting utilities (e.g. `cn('h-8', 'h-10')` → `'h-10'` instead of `'h-8 h-10'`).
 * This ensures `className` overrides on components behave predictably.
 *
 * Extended with custom class groups so tailwind-merge understands our `@theme` tokens:
 * - `text-ds-*` → font-size group (not color), so it correctly conflicts with other font-size
 *   utilities like `text-ds-md` and `text-ds-xs` without clobbering text-color utilities like
 *   `text-button-primary-text-default`.
 */
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            'font-size': [{ 'text-ds': ['3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'] }]
        }
    }
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
