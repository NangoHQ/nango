import { Loader } from '@geist-ui/icons';
import { cva, VariantProps } from 'class-variance-authority';
import classNames from 'classnames';
import React, { forwardRef } from 'react';

const buttonStyles = cva('flex items-center gap-2 disabled:pointer-events-none disabled:opacity-50 rounded-md', {
    variants: {
        variant: {
            primary: 'bg-white text-black',
            secondary: 'bg-black text-white',
            success: 'bg-green-700 text-white',
            danger: 'bg-red-700 text-white',
            zombie: 'bg-transparent text-white hover:bg-gray-700'
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
    isLoading?: true;
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
        <button
            ref={ref}
            className={classNames(buttonStyles({ className, variant, size }), {
                'flex-row-reverse': iconProps && iconProps.position === 'end'
            })}
            {...props}
        >
            {iconProps && iconProps.Icon}
            <div className="relative">
                <div className={classNames({ 'opacity-0': isLoading })}>{children}</div>
                {isLoading && <Loader className="absolute top-0 flex mx-auto inset-x-0 h-full" />}
            </div>
        </button>
    );
});

export default Button;
