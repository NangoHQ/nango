import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/cn';

import type { VariantProps } from 'class-variance-authority';

export const statusIndicatorVariants = cva('inline-flex w-fit shrink-0 items-center whitespace-nowrap', {
    variants: {
        tone: {
            neutral: '',
            muted: 'text-text-muted',
            success: '',
            info: '',
            warning: 'text-text-warning',
            danger: 'text-text-danger'
        },
        size: {
            sm: 'gap-1.25',
            md: 'gap-1.5'
        }
    },
    defaultVariants: {
        tone: 'neutral',
        size: 'md'
    }
});

const dotVariants = cva('shrink-0 rounded-full', {
    variants: {
        tone: {
            neutral: 'bg-border-strong',
            muted: 'bg-border-default',
            success: 'bg-icon-success',
            info: 'bg-icon-info',
            warning: 'bg-icon-warning',
            danger: 'bg-icon-danger'
        },
        size: {
            sm: 'size-1.5',
            md: 'size-1.75'
        },
        pulse: {
            true: 'motion-safe:animate-pulse',
            false: ''
        }
    },
    defaultVariants: {
        tone: 'neutral',
        size: 'md',
        pulse: false
    }
});

export interface StatusIndicatorProps extends React.ComponentProps<'span'>, VariantProps<typeof statusIndicatorVariants> {
    pulse?: boolean;
}

const StatusIndicator = React.forwardRef<HTMLSpanElement, StatusIndicatorProps>(({ className, tone, size, pulse = false, children, ...props }, ref) => (
    <span ref={ref} data-slot="status-indicator" className={cn(statusIndicatorVariants({ tone, size }), className)} {...props}>
        <span aria-hidden className={dotVariants({ tone, size, pulse })} />
        {children}
    </span>
));
StatusIndicator.displayName = 'StatusIndicator';

export { StatusIndicator };
