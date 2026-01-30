import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { Spinner } from './spinner';
import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';
import type { LinkProps } from 'react-router-dom';

const buttonVariants = cva(
    "w-fit inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md !text-body-medium-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-default",
    {
        variants: {
            variant: {
                primary:
                    'bg-btn-primary-bg text-btn-primary-fg hover:bg-btn-primary-hover active:bg-btn-primary-press focus:bg-btn-primary-hover disabled:bg-btn-primary-disabled data-loading:bg-btn-primary-loading data-loading:opacity-100',
                destructive:
                    'bg-btn-destructive-bg text-btn-destructive-fg hover:bg-btn-destructive-hover active:bg-btn-destructive-press focus:bg-btn-destructive-hover disabled:bg-btn-destructive-disabled data-loading:bg-btn-destructive-loading data-loading:opacity-100',
                secondary:
                    'bg-btn-secondary-bg text-btn-secondary-fg hover:bg-btn-secondary-hover active:bg-btn-secondary-press focus:bg-btn-secondary-hover disabled:bg-btn-secondary-disabled data-loading:bg-btn-secondary-loading data-loading:opacity-100',
                tertiary:
                    'bg-btn-tertiary-bg text-btn-tertiary-fg hover:bg-btn-tertiary-hover active:bg-btn-tertiary-press focus:bg-btn-tertiary-hover disabled:bg-btn-tertiary-disabled data-loading:bg-btn-tertiary-loading data-loading:opacity-100',
                ghost: 'bg-transparent text-text-tertiary hover:text-text-primary'
            },
            size: {
                sm: 'h-8 rounded gap-1.5 px-3 py-2',
                lg: 'h-10 rounded gap-2 px-4 py-2',
                icon: 'size-5 p-1'
            }
        },
        defaultVariants: {
            variant: 'primary',
            size: 'sm'
        }
    }
);

const Button = React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<'button'> &
        VariantProps<typeof buttonVariants> & {
            loading?: boolean;
            asChild?: boolean;
        }
>(({ className, variant, size, loading = false, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    if (loading) {
        return (
            <Comp ref={ref} data-slot="button" data-loading className={cn(buttonVariants({ variant, size, className }))} {...{ ...props, disabled: true }}>
                <Spinner />
                {props.children}
            </Comp>
        );
    }
    return <Comp ref={ref} data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});
Button.displayName = 'Button';

function ButtonLink({ className, variant, size, ...props }: LinkProps & VariantProps<typeof buttonVariants>) {
    return <Link data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, ButtonLink, buttonVariants };
