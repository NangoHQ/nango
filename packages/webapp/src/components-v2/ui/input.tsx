import * as React from 'react';

import { cn } from '@/utils/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, autoComplete, ...props }, ref) => {
    const blockPasswordManager = !autoComplete || autoComplete === 'off';
    return (
        <input
            ref={ref}
            type={type}
            data-slot="input"
            data-filled={props.value !== ''}
            className={cn(
                'bg-bg-surface border border-border-muted text-text-primary !text-body-medium-regular placeholder:text-text-tertiary focus-shadow focus:border-border-default data-[filled=true]:not-aria-invalid:border-border-strong',
                'file:text-neutral-950  flex h-9 w-full min-w-0 rounded px-3 py-1 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-body-medium-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
                'aria-invalid:focus-error aria-invalid:border-feedback-error-border',
                className
            )}
            autoComplete={autoComplete ?? 'off'}
            {...(blockPasswordManager ? { 'data-1p-ignore': true, 'data-lpignore': 'true', 'data-protonpass-ignore': 'true' } : {})}
            {...props}
        />
    );
});
Input.displayName = 'Input';

export { Input };
