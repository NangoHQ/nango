import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../../lib/cn';

export const envPillVariants = cva('type-code-medium-xs inline-flex h-5 w-fit max-w-48 shrink-0 items-center rounded-ds-sm px-1.5 whitespace-nowrap', {
    variants: {
        production: {
            false: 'bg-state-selected text-text-default',
            true: 'bg-status-warning-bg text-status-warning-text inset-ring-[0.5px] inset-ring-status-warning-border'
        }
    },
    defaultVariants: {
        production: false
    }
});

export interface EnvPillProps extends Omit<React.ComponentProps<'span'>, 'children'> {
    env: string;
    production?: boolean;
}

const EnvPill = React.forwardRef<HTMLSpanElement, EnvPillProps>(({ className, env, production = false, ...props }, ref) => (
    <span ref={ref} data-slot="env-pill" className={cn(envPillVariants({ production }), className)} {...props}>
        <span className="truncate">{env}</span>
    </span>
));
EnvPill.displayName = 'EnvPill';

export { EnvPill };
