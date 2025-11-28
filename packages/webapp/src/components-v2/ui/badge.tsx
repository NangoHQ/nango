import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
    'inline-flex items-center justify-center uppercase rounded px-2 py-0.5 text-body-extra-small-semi w-fit whitespace-nowrap shrink-0 [&>svg]:size-3.5 gap-1 [&>svg]:pointer-events-none',
    {
        variants: {
            variant: {
                gray: 'bg-badge-bg-gray text-text-primary',
                mint: 'bg-badge-bg-mint text-badge-fg-mint',
                pink: 'bg-badge-bg-pink text-badge-fg-pink',
                yellow: 'bg-badge-bg-yellow text-badge-fg-yellow',
                green: 'bg-badge-bg-green text-badge-fg-green'
            }
        },
        defaultVariants: {
            variant: 'gray'
        }
    }
);

function Badge({ className, variant, asChild = false, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
    const Comp = asChild ? Slot : 'span';

    return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
