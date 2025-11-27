import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';
import type { LinkProps } from 'react-router-dom';

const alertVariants = cva(
    'relative w-full h-fit rounded-md px-4 py-2 grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-1 items-center [&>svg]:size-4 [&>svg]:text-current [&>svg]:row-span-1 [&>svg]:self-center has-[>div[data-slot="alert-title"]]:has-[>div[data-slot="alert-description"]]:[&>[data-slot="alert-title"]]:self-end has-[>div[data-slot="alert-title"]]:has-[>div[data-slot="alert-description"]]:[&>[data-slot="alert-description"]]:self-start has-[>div[data-slot="alert-title"]]:has-[>div[data-slot="alert-description"]]:h-18 has-[>div[data-slot="alert-title"]]:has-[>div[data-slot="alert-description"]]:[&>svg]:row-span-2',
    {
        variants: {
            variant: {
                success: 'bg-feedback-success-bg text-feedback-success-fg',
                warning: 'bg-feedback-warning-bg text-feedback-warning-fg',
                info: 'bg-feedback-info-bg text-feedback-info-fg',
                destructive: 'bg-feedback-error-bg text-feedback-error-fg'
            }
        },
        defaultVariants: {
            variant: 'success'
        }
    }
);

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
    return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="alert-title" className={cn('col-start-2 line-clamp-1 min-h-4 text-body-large-semi self-center', className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="alert-description" className={cn('col-start-2 inline-flex gap-1 text-body-medium-regular self-center', className)} {...props} />;
}

function AlertActions({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="alert-actions"
            className={cn('col-start-3 row-start-1 row-span-2 inline-flex gap-1 text-body-medium-regular self-center', className)}
            {...props}
        />
    );
}

const alertButtonVariants = cva(
    "w-fit px-2 py-0.5 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded !text-body-small-medium transition-colors bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-default",
    {
        variants: {
            variant: {
                success: '',
                info: 'text-feedback-info-fg border border-feedback-info-fg hover:bg-blue-300 hover:border-feedback-info-bg hover:text-feedback-info-bg active:bg-feedback-info-fg',
                destructive: '',
                warning: ''
            }
        },
        defaultVariants: {
            variant: 'success'
        }
    }
);

function AlertButton({
    className,
    variant,
    asChild = false,
    ...props
}: React.ComponentProps<'button'> &
    VariantProps<typeof alertButtonVariants> & {
        asChild?: boolean;
    }) {
    const Comp = asChild ? Slot : 'button';
    return <Comp data-slot="button" className={cn(alertButtonVariants({ variant, className }))} {...props} />;
}

function AlertButtonLink({ className, variant, ...props }: LinkProps & VariantProps<typeof alertButtonVariants>) {
    return <Link data-slot="button" className={cn(alertButtonVariants({ variant, className }))} {...props} />;
}

export { Alert, AlertActions, AlertButton, AlertButtonLink, AlertDescription, AlertTitle };
