import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as React from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';
import type { LinkProps } from 'react-router-dom';

const alertVariants = cva(
    [
        'relative w-full h-fit rounded-md px-4 py-2 grid',
        'grid-cols-[0_1fr] gap-y-1 items-center',
        'has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3',
        'has-[>div[data-slot="alert-actions"]]:grid-cols-[0_1fr_auto]',
        'has-[>svg]:has-[>div[data-slot="alert-actions"]]:grid-cols-[calc(var(--spacing)*4)_1fr_auto]',
        '[&>svg]:size-4 [&>svg]:text-current [&>svg]:row-span-1 [&>svg]:self-center',
        'has-[>div[data-slot="alert-title"]]:has-[>div[data-slot="alert-description"]]:grid-rows-[auto_auto]',
        'has-[>div[data-slot="alert-title"]]:has-[>div[data-slot="alert-description"]]:[&>svg]:row-span-2',
        'has-[>div[data-slot="alert-title"]]:has-[>div[data-slot="alert-description"]]:[&>[data-slot="alert-title"]]:self-end',
        'has-[>div[data-slot="alert-title"]]:has-[>div[data-slot="alert-description"]]:[&>[data-slot="alert-description"]]:self-start',
        'has-[>div[data-slot="alert-title"]]:has-[>div[data-slot="alert-description"]]:[&>[data-slot="alert-actions"]]:row-start-1',
        'has-[>div[data-slot="alert-title"]]:has-[>div[data-slot="alert-description"]]:[&>[data-slot="alert-actions"]]:row-span-2',
        // actionsBelow: override grid to place actions on a new row below the content
        'data-[actions-below]:has-[>div[data-slot="alert-actions"]]:grid-cols-[0_1fr]',
        'data-[actions-below]:has-[>svg]:has-[>div[data-slot="alert-actions"]]:grid-cols-[calc(var(--spacing)*4)_1fr]',
        'data-[actions-below]:[&>[data-slot="alert-actions"]]:col-start-2 data-[actions-below]:[&>[data-slot="alert-actions"]]:row-start-auto',
        'data-[actions-below]:has-[>div[data-slot="alert-title"]]:has-[>div[data-slot="alert-description"]]:[&>[data-slot="alert-actions"]]:row-start-auto',
        'data-[actions-below]:has-[>div[data-slot="alert-title"]]:has-[>div[data-slot="alert-description"]]:[&>[data-slot="alert-actions"]]:row-span-1'
    ].join(' '),
    {
        variants: {
            variant: {
                success: 'bg-status-success-bg text-status-success-text',
                warning: 'bg-status-warning-bg text-status-warning-text',
                info: 'bg-status-info-bg text-status-info-text',
                error: 'bg-status-danger-bg text-status-danger-text'
            }
        },
        defaultVariants: {
            variant: 'success'
        }
    }
);

function Alert({
    className,
    variant,
    actionsBelow = false,
    ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants> & { actionsBelow?: boolean }) {
    return (
        <div data-slot="alert" role="alert" data-actions-below={actionsBelow || undefined} className={cn(alertVariants({ variant }), className)} {...props} />
    );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="alert-title" className={cn('col-start-2 min-h-4 text-body-large-semi self-center', className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="alert-description"
            className={cn('col-start-2 inline-flex gap-1 text-body-medium-regular self-center text-wrap', className)}
            {...props}
        />
    );
}

function AlertActions({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="alert-actions"
            className={cn('col-start-3 row-start-1 row-span-1 inline-flex gap-3 text-body-medium-regular !self-center', className)}
            {...props}
        />
    );
}

const alertButtonVariants = cva(
    "w-fit px-2 py-0.5 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded !text-body-small-medium transition-colors bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-default",
    {
        variants: {
            variant: {
                success:
                    'border border-transparent bg-status-success-icon text-status-success-bg hover:bg-status-success-bg-hover/30 hover:text-status-success-text hover:border-status-success-icon active:bg-status-success-bg active:border-status-success-bg active:text-status-success-text',
                'success-secondary':
                    'border border-status-success-icon bg-transparent text-status-success-text hover:border-status-success-bg hover:bg-status-success-bg-hover/30 active:border-transparent active:text-status-success-bg active:bg-status-success-icon',
                info: 'border border-transparent bg-status-info-icon text-status-info-bg hover:bg-status-info-bg-hover/30 hover:text-status-info-text hover:border-status-info-icon active:bg-status-info-bg active:text-status-info-text',
                'info-secondary':
                    'border border-status-info-icon bg-transparent text-status-info-text hover:bg-status-info-bg-hover/30 active:border-transparent active:text-status-info-bg active:bg-status-info-icon',
                error: 'border border-transparent bg-status-danger-icon text-status-danger-bg hover:bg-status-danger-bg-hover/30 hover:text-status-danger-text hover:border-status-danger-icon active:bg-status-danger-bg active:text-status-danger-text',
                'error-secondary':
                    'border border-status-danger-icon bg-transparent text-status-danger-text hover:bg-status-danger-bg-hover/30 active:border-transparent active:text-status-danger-bg active:bg-status-danger-icon',
                warning:
                    'border border-transparent bg-status-warning-icon text-status-warning-bg hover:bg-status-warning-bg-hover/30 hover:text-status-warning-text hover:border-status-warning-icon active:bg-status-warning-bg active:text-status-warning-text',
                'warning-secondary':
                    'border border-status-warning-icon bg-transparent text-status-warning-text hover:bg-status-warning-bg-hover/30 active:border-transparent active:text-status-warning-bg active:bg-status-warning-icon'
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
