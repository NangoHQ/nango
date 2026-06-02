import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const tagVariants = cva('inline-flex items-center justify-center rounded px-2 py-px w-fit whitespace-nowrap shrink-0 text-body-extra-small-semi uppercase', {
    variants: {
        variant: {
            success: 'bg-feedback-success-bg text-feedback-success-fg',
            alert: 'bg-feedback-error-bg text-feedback-error-fg',
            info: 'bg-feedback-info-bg text-feedback-info-fg',
            warning: 'bg-feedback-warning-bg text-feedback-warning-fg',
            disabled: 'bg-bg-subtle text-text-disabled',
            default: 'bg-badge-bg-gray text-badge-fg-gray',
            neutral: 'bg-bg-subtle text-text-secondary border border-border-muted'
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

export { Tag, tagVariants };
