/**
 * Figma "NavigationItem" as a menu row (radius 2) in the environment and profile menus. Hover uses
 * `focus:` because Radix focuses the item under the pointer.
 */
export const navigationMenuItemClassName =
    "h-8 gap-2 rounded-ds-xs px-2 py-0 type-text-regular-sm text-text-secondary [&_svg]:text-icon-secondary! [&_svg:not([class*='size-'])]:size-4 [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate focus:bg-state-hover focus:text-text-default focus:[&_svg]:text-icon-default!";

export const navigationMenuContentClassName =
    'flex flex-col rounded-ds-sm border-ds-hairline border-border-strong bg-surface-overlay p-1 shadow-container-panel';
