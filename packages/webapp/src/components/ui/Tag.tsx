import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const tagVariants = cva('inline-flex items-center justify-center px-2 py-px w-fit whitespace-nowrap shrink-0 uppercase rounded text-body-small-regular', {
    variants: {
        variant: {
            success: 'bg-status-success-bg text-status-success-text',
            alert: 'bg-status-danger-bg text-status-danger-text',
            info: 'bg-status-info-bg text-status-info-text',
            warning: 'bg-status-warning-bg text-status-warning-text',
            disabled: 'bg-surface-panel-inset text-text-disabled',
            default: 'bg-status-neutral-bg text-status-neutral-text',
            neutral: 'bg-surface-panel-inset text-text-secondary'
        }
    },
    defaultVariants: {
        variant: 'neutral'
    }
});

function Tag({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof tagVariants>) {
    return <span data-slot="tag" className={cn(tagVariants({ variant }), className)} {...props} />;
}

export { Tag, tagVariants };
