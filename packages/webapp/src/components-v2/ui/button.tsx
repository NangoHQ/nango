import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';
import type { LinkProps } from 'react-router-dom';

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all cursor-pointer disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-default aria-invalid:ring-red-500/20 aria-invalid:border-red-500",
    {
        variants: {
            variant: {
                primary:
                    'bg-btn-primary-bg text-btn-primary-fg hover:bg-btn-primary-hover active:bg-btn-primary-press focus:bg-btn-primary-hover disabled:bg-btn-primary-bg/50',
                destructive:
                    'bg-btn-destructive-bg text-btn-destructive-fg hover:bg-btn-destructive-hover active:bg-btn-destructive-press focus:bg-btn-destructive-hover disabled:bg-btn-destructive-bg/50',
                secondary:
                    'bg-btn-secondary-bg text-btn-secondary-fg hover:bg-btn-secondary-hover active:bg-btn-secondary-press focus:bg-btn-secondary-hover disabled:bg-btn-secondary-bg/50',
                tertiary:
                    'bg-btn-tertiary-bg text-btn-tertiary-fg hover:bg-btn-tertiary-hover active:bg-btn-tertiary-press focus:bg-btn-tertiary-hover disabled:bg-btn-tertiary-bg/50',
                // Not customized yet
                outline:
                    'border bg-white shadow-xs hover:bg-neutral-100 hover:text-neutral-900 dark:bg-neutral-200/30 dark:border-neutral-200 dark:hover:bg-neutral-200/50 dark:bg-neutral-950 dark:hover:bg-neutral-800 dark:hover:text-neutral-50 dark:dark:bg-neutral-800/30 dark:dark:border-neutral-800 dark:dark:hover:bg-neutral-800/50',
                ghost: 'hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-100/50 dark:hover:bg-neutral-800 dark:hover:text-neutral-50 dark:dark:hover:bg-neutral-800/50'
            },
            size: {
                sm: 'h-8 rounded gap-1.5 px-3 py-2 text-sm font-semibold',
                lg: 'h-10 rounded gap-2 px-4 py-2 font-semibold',
                icon: 'size-4 p-2'
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
