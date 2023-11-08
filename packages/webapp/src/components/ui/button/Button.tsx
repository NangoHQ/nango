import { Loader } from '@geist-ui/icons';
import { cva, VariantProps } from 'class-variance-authority';
import classNames from 'classnames';
import React, { forwardRef } from 'react';

const buttonStyles = cva('disabled:pointer-events-none disabled:opacity-50 rounded-md', {
    variants: {
        variant: {
            primary: 'bg-white text-black hover:bg-gray-300',
            secondary: 'bg-[#282828] text-white hover:bg-gray-800',
            success: 'bg-green-700 text-white hover:bg-green-500',
            danger: 'bg-red-700 text-white hover:bg-red-500',
            zombie: 'bg-transparent text-white hover:bg-gray-700',
            zombieGray: 'bg-transparent text-gray-500 hover:bg-gray-700 border border-gray-500',
            yellow: 'bg-yellow-500 text-white hover:bg-yellow-400',
            black: 'bg-black text-white hover:bg-gray-700',
        },
        size: {
            xs: 'h-8 py-1 px-2',
            sm: 'h-9 px-2 ',
            md: 'h-10 py-2 px-4',
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
    iconProps?: {
        Icon: React.ReactNode;
        position: 'start' | 'end';
    };
}

type ButtonProps = JSX.IntrinsicElements['button'] & VariantProps<typeof buttonStyles> & ExtraProps;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ size, variant, className, isLoading, children, iconProps, ...props }, ref) {
    if (isLoading) {
        props.disabled = true;
    }

    return (
        <button ref={ref} className={classNames(buttonStyles({ className, variant, size }), {})} {...props}>
            <div className="relative">
                <div
                    className={classNames('flex gap-2 items-center', { 'opacity-0': isLoading, 'flex-row-reverse': iconProps && iconProps.position === 'end' })}
                >
                    {iconProps && iconProps.Icon}
                    {children}
                </div>
                {isLoading && <Loader className="absolute animate-spin top-0 flex mx-auto inset-x-0 h-full" />}
            </div>
        </button>
    );
});

export default Button;
