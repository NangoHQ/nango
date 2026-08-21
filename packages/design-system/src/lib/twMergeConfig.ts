/**
 * tailwind-merge configuration for the design-system `@theme` token utilities.
 *
 * Exported so consumers running their own tailwind-merge instance (e.g. the
 * webapp) can feed in the same definitions instead of duplicating them — the
 * token class groups stay defined in exactly one place.
 *
 * Each group teaches tailwind-merge to resolve a token utility in the right
 * conflict group instead of mis-grouping it (e.g. `text-ds-*` as a colour) or
 * skipping dedup:
 *
 * - `text-ds-*`     → font-size       (not colour — avoids conflict with `text-*`)
 * - `font-ds-*`     → font-weight     (not font-family — avoids conflict with `font-sans`)
 * - `border-ds-*`   → border-width
 * - `rounded-ds-*`  → border-radius
 * - `leading-ds-*`  → line-height
 * - `tracking-ds-*` → letter-spacing
 * - `shadow-focus-outline-*`, `shadow-container-*` → box-shadow
 *
 * Kept as a plain data object (no tailwind-merge import) so it stays compatible
 * across tailwind-merge majors and adds no dependency for consumers.
 */
export const dsTwMergeConfig = {
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
};
