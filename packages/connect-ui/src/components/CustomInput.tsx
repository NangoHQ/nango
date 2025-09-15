import { forwardRef, useImperativeHandle, useRef } from 'react';

import { useFormField } from './ui/form';
import { cn } from '@/lib/utils';

import type { ReactNode } from '@tanstack/react-router';
import type { InputHTMLAttributes } from 'react';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
    prefix?: ReactNode;
    suffix?: ReactNode;
    fluid?: boolean;
};

// until shadcn provide before/after it's going to be custom
const CustomInput = forwardRef<HTMLInputElement, InputProps>(({ className, type, prefix, suffix, fluid, ...props }, forwardedRef) => {
    const ref = useRef<HTMLInputElement>(null);
    const { error } = useFormField();

    useImperativeHandle(forwardedRef, () => ref.current as HTMLInputElement);

    return (
        <div
            className={cn(
                'relative flex items-center bg-surface w-full shadow-xs rounded-sm border border-border-muted text-sm h-9 px-3 py-1 overflow-hidden focus-within:border-border-default focus-within:ring-1 focus-within:ring-brand-500/20',
                error ? 'border-error focus-within:border-error' : ''
            )}
            onClick={() => {
                ref.current?.focus();
            }}
        >
            {prefix && <div className="text-text-secondary px-1 bg-subtle border border-border-muted rounded-sm">{prefix}</div>}
            <input
                ref={ref}
                className={cn(
                    'bg-transparent border-0 h-full w-full rounded-sm focus-visible:outline-none file:border-0 file:bg-transparent file:text-sm file:font-medium outline-none disabled:text-text-primary/10 disabled:cursor-not-allowed',
                    'text-sm text-text-primary placeholder-text-text-secondary',
                    (fluid || suffix) && 'grow-0 field-sizing-content w-auto',
                    prefix && 'pl-1',
                    suffix && 'pr-1',
                    className
                )}
                type={type}
                {...props}
            />
            {suffix && <div className="text-text-secondary px-1 bg-subtle border border-border-muted rounded-sm">{suffix}</div>}
        </div>
    );
});
CustomInput.displayName = 'Input';

export { CustomInput };
