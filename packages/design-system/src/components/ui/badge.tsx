import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/cn';

import type { VariantProps } from 'class-variance-authority';

export const badgeVariants = cva(
    // Figma "Badge" (Size=sm): monospace code/regular/xs text, 2px radius, 4px inline padding.
    'type-code-regular-xs inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-ds-xs px-1 whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5',
    {
        variants: {
            variant: {
                default: 'border-ds-hairline border-border-default bg-interactive-disabled text-text-default',
                secondary: 'border-ds-hairline border-border-default bg-surface-raised text-text-secondary',
                outline: 'border-ds-hairline border-border-input text-text-secondary',
                ghost: 'border-ds-hairline border-transparent text-text-secondary',
                brand: 'bg-status-info-bg text-text-brand',
                success: 'bg-status-success-bg text-status-success-text',
                warning: 'bg-status-warning-bg text-status-warning-text',
                danger: 'bg-status-danger-bg text-status-danger-text'
            },
            // Text casing. Figma renders labels as-authored; `capitalize` is opt-in.
            case: {
                normal: '',
                capitalize: 'capitalize'
            }
        },
        defaultVariants: {
            variant: 'default',
            case: 'normal'
        }
    }
);

export interface BadgeProps extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
    asChild?: boolean;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, case: textCase, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'span';
    return <Comp ref={ref} data-slot="badge" className={cn(badgeVariants({ variant, case: textCase }), className)} {...props} />;
});
Badge.displayName = 'Badge';

export { Badge };
