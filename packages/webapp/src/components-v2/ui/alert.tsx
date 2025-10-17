import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const alertVariants = cva(
    'relative w-full rounded-md px-4 py-2 h-fit grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-1 items-start [&>svg]:size-4 [&>svg]:text-current [&>svg]:self-center',
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
    return <div data-slot="alert-title" className={cn('col-start-2 self-end line-clamp-1 min-h-4 font-semibold leading-6', className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            data-slot="alert-description"
            className={cn('col-start-2 self-start inline-flex justify-items-start gap-1 text-sm leading-5', className)}
            {...props}
        />
    );
}

export { Alert, AlertDescription, AlertTitle };
