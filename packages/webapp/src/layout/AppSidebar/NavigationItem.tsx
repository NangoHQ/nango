import { cva } from 'class-variance-authority';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

/**
 * Shared "Navigation Item" — Figma node 1:3111. Used by the environment and profile dropdowns.
 *
 * Apply `navigationItemVariants(...)` to the interactive row element (e.g. a Radix
 * `DropdownMenuItem`) and render `<NavigationItem>` as its content.
 *
 * States:
 * - Default  → transparent bg, `text-secondary` label, `icon-secondary` icon
 * - Hover    → `state-hover` bg, `text-default` label/icon (driven by `focus:` — Radix focuses on pointer)
 * - Selected → `state-selected` bg + 2px `interactive-selected-fill` left accent bar, `text-default`
 * - Disabled → `text-disabled` label/icon
 */
export const navigationItemVariants = cva(
    cn(
        'group/navitem flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-none border-l-2 border-transparent pl-2 pr-1 outline-none transition-colors',
        'type-text-regular-sm text-text-secondary [&_svg]:text-icon-secondary!',
        'focus:bg-state-hover focus:text-text-default focus:[&_svg]:text-icon-default!',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-100 data-[disabled]:text-text-disabled data-[disabled]:[&_svg]:text-icon-disabled!'
    ),
    {
        variants: {
            selected: {
                true: 'bg-state-selected border-interactive-selected-fill text-text-default [&_svg]:text-icon-default!',
                false: ''
            }
        },
        defaultVariants: {
            selected: false
        }
    }
);

interface NavigationItemProps extends VariantProps<typeof navigationItemVariants> {
    /** Leading 16px icon (optional — env items have no icon). */
    icon?: React.ReactNode;
    /** Trailing slot, right-aligned (e.g. the "Prod" badge). */
    trailing?: React.ReactNode;
    children: React.ReactNode;
}

/** Inner layout of a navigation item: leading icon (16px) + label (13px) + optional trailing slot. */
export const NavigationItem: React.FC<NavigationItemProps> = ({ icon, trailing, children }) => (
    <>
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
            {icon != null && <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">{icon}</span>}
            <span className="truncate">{children}</span>
        </span>
        {trailing != null && <span className="flex shrink-0 items-center">{trailing}</span>}
    </>
);
