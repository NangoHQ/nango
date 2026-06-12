import { Loader2Icon } from 'lucide-react';

import { cn } from '../../lib/cn';

const sizeClasses = {
    xs: 'size-[var(--ds-icon-size-xs)]',
    sm: 'size-[var(--ds-icon-size-sm)]',
    md: 'size-[var(--ds-icon-size-md)]',
    lg: 'size-[var(--ds-icon-size-lg)]',
    xl: 'size-[var(--ds-icon-size-xl)]'
} as const;

export type SpinnerSize = keyof typeof sizeClasses;

export interface SpinnerProps extends React.ComponentProps<'svg'> {
    size?: SpinnerSize;
}

function Spinner({ className, size = 'md', ...props }: SpinnerProps) {
    return <Loader2Icon role="status" aria-label="Loading" className={cn('animate-spin', sizeClasses[size], className)} {...props} />;
}

export { Spinner };
