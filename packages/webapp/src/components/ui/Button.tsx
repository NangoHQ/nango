import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { Spinner } from './Spinner';
import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';
import type { LinkProps } from 'react-router-dom';

const buttonVariants = cva(
    "w-fit inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md !text-body-medium-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-default",
    {
        variants: {
            variant: {
                primary:
                    'bg-interactive-primary text-text-on-accent hover:bg-interactive-primary-hover active:bg-interactive-primary-active focus-visible:bg-interactive-primary-hover disabled:bg-interactive-disabled disabled:text-text-disabled data-loading:bg-interactive-primary-active data-loading:opacity-100 aria-disabled:hover:bg-interactive-primary aria-disabled:active:bg-interactive-primary',
                destructive:
                    'bg-interactive-danger text-text-on-accent hover:bg-interactive-danger-hover active:bg-interactive-danger-active focus-visible:bg-interactive-danger-hover disabled:bg-interactive-disabled disabled:text-text-disabled data-loading:bg-interactive-danger-active data-loading:opacity-100 aria-disabled:hover:bg-interactive-danger aria-disabled:active:bg-interactive-danger',
                secondary:
                    'bg-surface-raised border border-border-muted text-text-default hover:bg-state-hover hover:border-border-strong active:bg-state-pressed disabled:bg-interactive-disabled disabled:border-border-muted data-loading:bg-state-pressed data-loading:opacity-100 aria-disabled:hover:bg-surface-raised aria-disabled:active:bg-surface-raised',
                tertiary:
                    'bg-surface-panel text-text-secondary hover:bg-state-hover active:bg-state-pressed focus-visible:bg-state-hover disabled:bg-interactive-disabled data-loading:bg-state-pressed data-loading:opacity-100 aria-disabled:hover:bg-surface-panel aria-disabled:active:bg-surface-panel',
                ghost: 'bg-transparent text-text-muted hover:text-text-strong aria-disabled:hover:text-text-muted',
                outline:
                    'bg-transparent border border-border-muted text-text-secondary hover:bg-state-hover hover:text-text-strong hover:border-border-strong active:bg-state-pressed disabled:border-border-muted aria-disabled:hover:bg-transparent aria-disabled:hover:text-text-secondary aria-disabled:hover:border-border-muted'
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
            <Comp
                ref={ref}
                data-slot="button"
                data-loading
                className={cn(buttonVariants({ variant, size, className }), '[&>svg]:hidden [&>svg[data-spinner]]:block')}
                {...{ ...props, disabled: true }}
            >
                <Spinner data-spinner />
                {props.children}
            </Comp>
        );
    }
    return <Comp ref={ref} data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});
Button.displayName = 'Button';

type ButtonLinkProps = LinkProps &
    VariantProps<typeof buttonVariants> & {
        disabled?: boolean;
    };

const ButtonLink = React.forwardRef<HTMLAnchorElement, ButtonLinkProps>(({ className, variant, size, disabled, onClick, ...props }, ref) => {
    return (
        <Link
            ref={ref}
            data-slot="button"
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : undefined}
            className={cn(buttonVariants({ variant, size, className }))}
            onClick={disabled ? (e) => e.preventDefault() : onClick}
            {...props}
        />
    );
});
ButtonLink.displayName = 'ButtonLink';

export { Button, ButtonLink, buttonVariants };
