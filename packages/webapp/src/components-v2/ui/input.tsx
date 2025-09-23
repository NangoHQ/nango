import * as React from 'react';

import { cn } from '@/utils/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
    return (
        <input
            type={type}
            data-slot="input"
            data-filled={props.value !== ''}
            className={cn(
                'bg-background-surface border border-border-muted text-text-primary placeholder:text-text-tertiary focus-shadow focus:border-border-default data-[filled=true]:border-border-strong',
                'file:text-neutral-950  flex h-9 w-full min-w-0 rounded px-3 py-1 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
                'aria-invalid:ring-red-500/20  aria-invalid:border-red-500',
                className
            )}
            {...props}
        />
    );
}

export { Input };
