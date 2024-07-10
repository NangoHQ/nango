import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cva } from 'class-variance-authority';

import { cn } from '../../../utils/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;
export const inputStyles = cva('', {
    variants: {
        size: {
            xs: 'text-sm ',
            sm: 'text-sm ',
            md: 'text-sm',
            lg: 'text-sm px-3 py-[13px] placeholder-gray-400'
        }
    },
    defaultVariants: {
        size: 'sm'
    }
});

const Input = forwardRef<
    HTMLInputElement,
    InputProps & {
        before?: React.ReactNode;
        after?: React.ReactNode;
        inputSize?: 'xs' | 'sm' | 'md' | 'lg';
    }
>(({ className, type, before, after, inputSize, ...props }, ref) => {
    return (
        <div
            className={cn(
                'relative flex items-center bg-transparent w-full rounded border border-zinc-900 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                className
            )}
        >
            {before && <div className="absolute text-text-light-gray px-2">{before}</div>}
            <input
                type={type}
                ref={ref}
                className={cn(
                    'bg-transparent border-0 h-full w-full text-white file:border-0 file:bg-transparent file:text-sm file:font-medium outline-none',
                    inputStyles({ size: inputSize }),
                    before && 'pl-8',
                    after && 'pr-8'
                )}
                {...props}
            />
            {after && <div className="absolute right-0 text-text-light-gray px-2">{after}</div>}
        </div>
    );
});
Input.displayName = 'Input';

export { Input };
