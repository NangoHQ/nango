import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

import { cn } from '../../../utils/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<
    HTMLInputElement,
    InputProps & {
        before?: React.ReactNode;
        after?: React.ReactNode;
    }
>(({ className, type, before, after, ...props }, ref) => {
    return (
        <div
            className={cn(
                'relative flex items-center bg-pure-black w-full rounded border border-zinc-900 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                className
            )}
        >
            {before && <div className="absolute text-text-light-gray px-2">{before}</div>}
            <input
                type={type}
                ref={ref}
                className={cn(
                    'bg-transparent h-full px-3 py-1.5 w-full text-white file:border-0 file:bg-transparent file:text-sm file:font-medium',
                    before && 'pl-8'
                )}
                {...props}
            />
            {after && <div>{after}</div>}
        </div>
    );
});
Input.displayName = 'Input';

export { Input };
