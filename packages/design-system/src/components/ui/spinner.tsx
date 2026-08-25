import { Loader2Icon } from 'lucide-react';

import { cn } from '../../lib/cn';

// Native size utilities — the 4px scale matches the --ds-icon-size-* tokens exactly.
const sizeClasses = {
    xs: 'size-3', // 12px
    sm: 'size-3.5', // 14px
    md: 'size-4', // 16px
    lg: 'size-5', // 20px
    xl: 'size-6' // 24px
} as const;

export type SpinnerSize = keyof typeof sizeClasses;

export interface SpinnerProps extends React.ComponentProps<'svg'> {
    size?: SpinnerSize;
}

function Spinner({ className, size = 'md', ...props }: SpinnerProps) {
    return <Loader2Icon role="status" aria-label="Loading" className={cn('animate-spin', sizeClasses[size], className)} {...props} />;
}

export { Spinner };
