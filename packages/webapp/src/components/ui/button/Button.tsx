import { Loader } from '@geist-ui/icons';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '../../../utils/utils';

export const buttonStyles = cva('disabled:pointer-events-none disabled:opacity-50 rounded text-sm', {
    variants: {
        variant: {
            primary: 'bg-white text-black hover:bg-gray-300',
            secondary: 'bg-[#282828] text-white hover:bg-gray-800',
            success: 'bg-green-700 text-white hover:bg-green-500',
            danger: 'bg-red-700 text-white hover:bg-red-500',
            zombie: 'bg-transparent text-white hover:bg-active-gray',
            zombieGray: 'bg-transparent text-white hover:bg-hover-gray border border-active-gray',
            yellow: 'bg-yellow-500 text-white hover:bg-yellow-400',
            black: 'bg-black text-white hover:bg-hover-gray',
            active: 'bg-active-gray text-white',
            hover: 'hover:bg-hover-gray text-white',
            zinc: 'bg-active-gray hover:bg-neutral-800 text-gray-400 border border-neutral-700'
        },
        size: {
            xs: 'h-8 py-1 px-3',
            sm: 'h-9 px-2 ',
            md: 'h-9 py-2 px-4',
            lg: 'h-11 px-8'
        }
    },
    defaultVariants: {
        variant: 'primary',
        size: 'md'
    }
});

interface ExtraProps {
    isLoading?: boolean;
}

type ButtonProps = JSX.IntrinsicElements['button'] & VariantProps<typeof buttonStyles> & ExtraProps;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ size, variant, className, isLoading, children, ...props }, ref) {
    if (isLoading) {
        props.disabled = true;
    }

    return (
        <button ref={ref} className={cn(buttonStyles({ className, variant, size }), 'flex gap-2 items-center', isLoading && 'opacity-0')} {...props}>
            {children}
            {isLoading && <Loader className="absolute animate-spin top-0 flex mx-auto inset-x-0 h-full" />}
        </button>
    );
});

export default Button;
