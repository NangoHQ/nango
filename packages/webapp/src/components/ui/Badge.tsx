import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
    'inline-flex items-center justify-center rounded px-2 py-0.5 w-fit whitespace-nowrap shrink-0 [&>svg]:size-3.5 gap-1 [&>svg]:pointer-events-none',
    {
        variants: {
            variant: {
                gray: 'bg-status-neutral-bg text-status-neutral-text',
                secondary: 'bg-surface-panel-inset text-text-secondary border border-border-muted',
                brand: 'bg-status-info-bg text-text-brand',
                mint: 'bg-status-success-bg text-status-success-text',
                pink: 'bg-status-danger-bg text-status-danger-text',
                yellow: 'bg-status-warning-bg text-status-warning-text',
                green: 'bg-status-success-bg text-status-success-text',
                ghost: 'bg-transparent text-text-secondary border border-border-default'
            },
            size: {
                xs: '!text-body-extra-small-semi',
                custom: ''
            }
        },
        defaultVariants: {
            variant: 'gray',
            size: 'xs'
        }
    }
);

function Badge({
    className,
    variant,
    size,
    asChild = false,
    ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
    const Comp = asChild ? Slot : 'span';

    return <Comp data-slot="badge" className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
