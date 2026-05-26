import { cva } from 'class-variance-authority';

import { cn } from '../../lib/cn';

import type { VariantProps } from 'class-variance-authority';

const spinnerVariants = cva('inline-block animate-[ds-spin_0.75s_linear_infinite]', {
    variants: {
        size: {
            xs: 'size-[var(--ds-icon-size-xs)]',
            sm: 'size-[var(--ds-icon-size-sm)]',
            md: 'size-[var(--ds-icon-size-md)]',
            lg: 'size-[var(--ds-icon-size-lg)]',
            xl: 'size-[var(--ds-icon-size-xl)]'
        }
    },
    defaultVariants: {
        size: 'md'
    }
});

export interface SpinnerProps extends VariantProps<typeof spinnerVariants> {
    className?: string;
    label?: string;
}

export function Spinner({ size, className, label = 'Loading' }: SpinnerProps) {
    const r = 8;
    const circumference = 2 * Math.PI * r;

    return (
        <svg viewBox="0 0 20 20" fill="none" aria-label={label} role="status" className={cn(spinnerVariants({ size }), className)}>
            <circle cx="10" cy="10" r={r} strokeWidth="2" stroke="var(--spinner-track)" strokeLinecap="round" />
            <circle
                cx="10"
                cy="10"
                r={r}
                strokeWidth="2"
                stroke="var(--spinner-indicator)"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * 0.75}
                transform="rotate(-90 10 10)"
            />
        </svg>
    );
}
