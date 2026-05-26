import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { forwardRef } from 'react';

import { cn } from '../../lib/cn';

import type { VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

export const filterBadgeVariants = cva(
    [
        'inline-flex items-center gap-[var(--ds-space-1)] border-[length:var(--ds-border-width-hairline)]',
        'rounded-[var(--ds-radius-full)] px-[var(--ds-space-2)] h-[1.375rem]',
        'text-[length:var(--ds-typography-font-size-xs)] [font-weight:var(--ds-typography-font-weight-medium)] leading-none',
        'cursor-pointer select-none',
        'transition-[background-color,border-color,color,box-shadow]',
        'duration-[var(--ds-motion-duration-fast)] ease-[var(--ds-motion-easing-standard)]',
        'focus-visible:outline-none focus-visible:shadow-[var(--focus-outline-default)]',
        'disabled:cursor-not-allowed',
        '[&_svg]:shrink-0 [&_svg]:size-[0.625rem]'
    ],
    {
        variants: {
            selected: {
                false: [
                    'bg-[var(--filter-badge-unselected-bg-default)] text-[var(--filter-badge-unselected-text-default)]',
                    'border-[var(--filter-badge-unselected-border-default)]',
                    'hover:bg-[var(--filter-badge-unselected-bg-hover)] hover:text-[var(--filter-badge-unselected-text-hover)] hover:border-[var(--filter-badge-unselected-border-hover)]',
                    'disabled:bg-[var(--filter-badge-unselected-bg-disabled)] disabled:text-[var(--filter-badge-unselected-text-disabled)] disabled:border-[var(--filter-badge-unselected-border-disabled)]'
                ],
                true: [
                    'bg-[var(--filter-badge-selected-bg-default)] text-[var(--filter-badge-selected-text-default)]',
                    'border-[var(--filter-badge-selected-border-default)]',
                    'hover:bg-[var(--filter-badge-selected-bg-hover)] hover:text-[var(--filter-badge-selected-text-hover)] hover:border-[var(--filter-badge-selected-border-hover)]',
                    'disabled:bg-[var(--filter-badge-selected-bg-disabled)] disabled:text-[var(--filter-badge-selected-text-disabled)] disabled:border-[var(--filter-badge-selected-border-disabled)]'
                ]
            }
        },
        defaultVariants: {
            selected: false
        }
    }
);

export interface FilterBadgeProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>, VariantProps<typeof filterBadgeVariants> {
    asChild?: boolean;
    children: ReactNode;
    leadingIcon?: ReactNode;
}

export const FilterBadge = forwardRef<HTMLButtonElement, FilterBadgeProps>(({ className, selected, asChild = false, children, leadingIcon, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    return (
        <Comp ref={ref} type="button" aria-pressed={selected ?? undefined} className={cn(filterBadgeVariants({ selected }), className)} {...props}>
            {leadingIcon && <span>{leadingIcon}</span>}
            {children}
        </Comp>
    );
});

FilterBadge.displayName = 'FilterBadge';
