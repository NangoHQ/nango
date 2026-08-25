import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

import { dsTwMergeConfig } from './twMergeConfig';

import type { ClassValue } from 'clsx';

/**
 * Merges Tailwind class names, resolving conflicts so the last value wins
 * (e.g. `cn('h-8', 'h-10')` → `'h-10'`). `clsx` handles conditional/array
 * syntax; `tailwind-merge` deduplicates conflicting utilities.
 *
 * `dsTwMergeConfig` teaches tailwind-merge about our `@theme` token utilities
 * (`text-ds-*`, `border-ds-*`, …) so it resolves them in the right conflict
 * group instead of mis-grouping them or skipping dedup. It's exported from the
 * package so consumers can reuse the same definitions in their own `cn`.
 */
const twMerge = extendTailwindMerge(dsTwMergeConfig);

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
