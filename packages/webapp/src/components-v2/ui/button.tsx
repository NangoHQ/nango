import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';
import type { LinkProps } from 'react-router-dom';

const buttonVariants = cva(
    "w-fit inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-default",
    {
        variants: {
            variant: {
                primary:
                    'bg-btn-primary-bg text-btn-primary-fg hover:bg-btn-primary-hover active:bg-btn-primary-press focus:bg-btn-primary-hover disabled:bg-btn-secondary-bg',
                destructive:
                    'bg-btn-destructive-bg text-btn-destructive-fg hover:bg-btn-destructive-hover active:bg-btn-destructive-press focus:bg-btn-destructive-hover',
                secondary: 'bg-btn-secondary-bg text-btn-secondary-fg hover:bg-btn-secondary-hover active:bg-btn-secondary-press focus:bg-btn-secondary-hover',
                tertiary: 'bg-btn-tertiary-bg text-btn-tertiary-fg hover:bg-btn-tertiary-hover active:bg-btn-tertiary-press focus:bg-btn-tertiary-hover',
                ghost: 'bg-transparent text-text-tertiary hover:text-text-primary'
            },
            size: {
                sm: 'h-8 rounded gap-1.5 px-3 py-2 text-sm',
                lg: 'h-10 rounded gap-2 px-4 py-2 font-semibold',
                icon: 'size-5 p-1'
            }
        },
        defaultVariants: {
            variant: 'primary',
            size: 'sm'
        }
    }
);

function Button({
    className,
    variant,
    size,
    asChild = false,
    ...props
}: React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
        asChild?: boolean;
    }) {
    const Comp = asChild ? Slot : 'button';
    return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

function ButtonLink({ className, variant, size, ...props }: LinkProps & VariantProps<typeof buttonVariants>) {
    return <Link data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, ButtonLink, buttonVariants };
