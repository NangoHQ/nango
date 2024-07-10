import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

import { cn } from '../../../utils/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;
export const inputStyles = cva('', {
    variants: {
        inputSize: {
            xs: 'text-sm px-3 py-[4px] placeholder-gray-400',
            sm: 'text-sm px-3 py-[7px] placeholder-gray-400',
            md: 'text-sm px-3 py-[10px] placeholder-gray-400',
            lg: 'text-sm px-3 py-[13px] placeholder-gray-400'
        },
        variant: {
            empty: '',
            main: 'bg-active-gray'
        }
    },
    defaultVariants: {
        inputSize: 'sm',
        variant: 'empty'
    }
});

const Input = forwardRef<
    HTMLInputElement,
    InputProps & {
        before?: React.ReactNode;
        after?: React.ReactNode;
    } & VariantProps<typeof inputStyles>
>(({ className, type, before, after, inputSize, variant, ...props }, ref) => {
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
                    inputStyles({ inputSize, variant }),
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
