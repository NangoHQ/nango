import * as React from 'react';

import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
    prefix?: React.ReactNode;
    suffix?: React.ReactNode;
    fluid?: boolean;
};

// until shadcn provide before/after it's going to be custom
const CustomInput = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, prefix, suffix, fluid, ...props }, ref) => {
    return (
        <div className={cn('relative flex items-center bg-transparent w-full rounded border text-sm h-10 overflow-hidden')}>
            {prefix && <div className="h-10 px-2 leading-10 italic text-dark-500">{prefix}</div>}
            <input
                ref={ref}
                className={cn(
                    'bg-transparent border-0 h-full w-full rounded focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-1 file:border-0 file:bg-transparent file:text-sm file:font-medium outline-none disabled:text-text-light-gray disabled:cursor-not-allowed',
                    'text-sm px-3 py-[10px] placeholder-gray-400',
                    (fluid || suffix) && 'grow-0 [field-sizing:content] w-auto',
                    className
                )}
                type={type}
                {...props}
            />
            {suffix && <div className="h-10 px-2 leading-10 italic text-dark-500">{suffix}</div>}
        </div>
    );
});
CustomInput.displayName = 'Input';

export { CustomInput };
