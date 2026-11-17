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
 * - `border-ds-*`, `border-{side}-ds-*` → border-width
 * - `rounded-ds-*`  → border-radius
 * - `leading-ds-*`  → line-height
 * - `tracking-ds-*` → letter-spacing
 * - `shadow-focus-outline-*`, `shadow-container-*` → box-shadow
 *
 * Kept as a plain data object (no tailwind-merge import) so it stays compatible
 * across tailwind-merge majors and adds no dependency for consumers.
 */
const BORDER_WIDTHS = ['0', '1', '2', 'hairline'];

export const dsTwMergeConfig = {
    extend: {
        classGroups: {
            'font-size': [{ 'text-ds': ['3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'] }],
            'font-weight': [{ 'font-ds': ['regular', 'medium', 'semibold', 'bold'] }],
            'border-w': [{ 'border-ds': BORDER_WIDTHS }],
            'border-w-x': [{ 'border-x-ds': BORDER_WIDTHS }],
            'border-w-y': [{ 'border-y-ds': BORDER_WIDTHS }],
            'border-w-s': [{ 'border-s-ds': BORDER_WIDTHS }],
            'border-w-e': [{ 'border-e-ds': BORDER_WIDTHS }],
            'border-w-t': [{ 'border-t-ds': BORDER_WIDTHS }],
            'border-w-r': [{ 'border-r-ds': BORDER_WIDTHS }],
            'border-w-b': [{ 'border-b-ds': BORDER_WIDTHS }],
            'border-w-l': [{ 'border-l-ds': BORDER_WIDTHS }],
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
