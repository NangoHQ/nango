import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

import { cn } from '../../../utils/utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;
export const wrapperStyles = cva('', {
    variants: {
        variant: {
            empty: 'border-dark-800',
            flat: 'bg-active-gray border-dark-800',
            border: 'bg-active-gray border-border-gray-400',
            black: 'bg-pure-black border-grayscale-600 hover:border-grayscale-500 focus-visible:border-grayscale-500 focus-within:bg-grayscale-900'
        }
    },
    defaultVariants: {
        variant: 'empty'
    }
});
export const inputStyles = cva('', {
    variants: {
        inputSize: {
            xs: 'text-sm px-3 py-[4px] placeholder-gray-400',
            sm: 'text-sm px-3 py-[7px] placeholder-gray-400',
            md: 'text-sm px-3 py-[10px] placeholder-gray-400',
            lg: 'text-sm px-3 h-[42px] placeholder-gray-400'
        }
    },
    defaultVariants: {
        inputSize: 'md'
    }
});

const Input = forwardRef<
    HTMLInputElement,
    InputProps & {
        before?: React.ReactNode;
        after?: React.ReactNode;
    } & VariantProps<typeof inputStyles> &
        VariantProps<typeof wrapperStyles>
>(({ className, type, before, after, inputSize, variant, ...props }, ref) => {
    return (
        <div
            className={cn('transition-colors relative flex items-center bg-transparent w-full rounded border text-sm ', wrapperStyles({ variant }), className)}
        >
            {before && <div className="absolute text-text-light-gray px-2">{before}</div>}
            <input
                type={type}
                ref={ref}
                className={cn(
                    'bg-transparent border-0 h-full w-full rounded text-white focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-1 file:border-0 file:bg-transparent file:text-sm file:font-medium outline-none disabled:text-text-light-gray disabled:cursor-not-allowed',
                    inputStyles({ inputSize }),
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
