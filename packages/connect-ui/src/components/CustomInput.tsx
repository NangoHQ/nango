import { forwardRef, useImperativeHandle, useRef } from 'react';

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

    useImperativeHandle(forwardedRef, () => ref.current as HTMLInputElement);

    return (
        <div
            className={cn(
                'relative flex items-center bg-transparent w-full rounded border text-sm h-10 overflow-hidden focus-within:ring-ring focus-within:ring-1'
            )}
            onClick={() => {
                ref.current?.focus();
            }}
        >
            {prefix && <div className="h-10 px-2 pr-0.5 leading-10 text-dark-400">{prefix}</div>}
            <input
                ref={ref}
                className={cn(
                    'bg-transparent border-0 h-full w-full rounded focus-visible:outline-none file:border-0 file:bg-transparent file:text-sm file:font-medium outline-none disabled:text-text-light-gray disabled:cursor-not-allowed',
                    'text-sm px-3 py-[10px] placeholder-gray-400',
                    (fluid || suffix) && 'grow-0 [field-sizing:content] w-auto',
                    prefix && 'pl-0.5',
                    suffix && 'pr-0.5',
                    className
                )}
                type={type}
                {...props}
            />
            {suffix && <div className="h-10 px-2 pl-0.5 leading-10 text-dark-400">{suffix}</div>}
        </div>
    );
});
CustomInput.displayName = 'Input';

export { CustomInput };
