import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const tagVariants = cva('inline-flex items-center justify-center rounded px-2 py-px w-fit whitespace-nowrap shrink-0 text-body-extra-small-semi uppercase', {
    variants: {
        variant: {
            success: 'bg-status-success-bg text-status-success-text',
            alert: 'bg-status-danger-bg text-status-danger-text',
            info: 'bg-status-info-bg text-status-info-text',
            warning: 'bg-status-warning-bg text-status-warning-text',
            disabled: 'bg-surface-panel-inset text-text-disabled',
            default: 'bg-status-neutral-bg text-status-neutral-text',
            neutral: 'bg-surface-panel-inset text-text-secondary border border-border-muted'
        },
        size: {
            md: '',
            sm: 'text-[12px] font-normal rounded-sm'
        }
    },
    defaultVariants: {
        variant: 'neutral',
        size: 'md'
    }
});

function Tag({ className, variant, size, ...props }: React.ComponentProps<'span'> & VariantProps<typeof tagVariants>) {
    return <span data-slot="tag" className={cn(tagVariants({ variant, size }), className)} {...props} />;
}

export type TagSize = NonNullable<VariantProps<typeof tagVariants>['size']>;

export { Tag, tagVariants };
