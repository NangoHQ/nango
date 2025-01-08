import { Loader } from '@geist-ui/icons';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '../../../utils/utils';
import { Link } from 'react-router-dom';
import type { LinkProps } from 'react-router-dom';

export type ButtonVariants = VariantProps<typeof buttonStyles>['variant'];

export const buttonStyles = cva(
    'rounded text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-100',
    {
        variants: {
            variant: {
                primary: 'bg-white text-black disabled:bg-active-gray disabled:text-white',
                success: 'bg-green-700 text-white hover:bg-green-500',
                danger: 'bg-red-base text-white hover:bg-red-500',
                zombie: 'bg-transparent text-white hover:bg-active-gray',
                zombieGray: 'bg-transparent text-white hover:bg-hover-gray border border-active-gray',
                yellow: 'bg-yellow-500 text-white hover:bg-yellow-400',
                black: 'bg-black text-white hover:bg-hover-gray',
                active: 'bg-active-gray text-white',
                hover: 'hover:bg-hover-gray text-white',
                zinc: 'bg-active-gray hover:bg-neutral-800 text-gray-400 border border-neutral-700',
                icon: 'bg-transparent text-text-light-gray hover:text-white focus:text-white',
                emptyFaded:
                    'border border-grayscale-700 text-grayscale-400 hover:text-white focus:text-white hover:border-grayscale-400 focus:border-grayscale-400',

                // Design system v2
                link: 'text-grayscale-400 hover:text-white focus:text-white',
                select: 'bg-grayscale-900 text-grayscale-400 border border-grayscale-900 hover:text-white focus:text-white hover:border-grayscale-600',
                popoverItem: 'w-full rounded hover:bg-grayscale-900 text-grayscale-300 focus:bg-grayscale-900',
                secondary: 'bg-grayscale-900 text-grayscale-400 border border-grayscale-700 hover:text-white focus:text-white hover:border-grayscale-600',
                tertiary: 'bg-grayscale-800 text-grayscale-100 border border-transparent hover:text-white focus:text-white hover:border-grayscale-600'
            },
            size: {
                auto: '',
                xs: 'h-6 py-0.5 px-2 text-xs',
                sm: 'h-8 px-3',
                md: 'h-9 py-2 px-4',
                lg: 'h-11 px-4'
            }
        },
        defaultVariants: {
            variant: 'primary',
            size: 'md'
        }
    }
);

interface ExtraProps {
    isLoading?: boolean;
}

type ButtonProps = JSX.IntrinsicElements['button'] & VariantProps<typeof buttonStyles> & ExtraProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ size, variant, className, isLoading, children, ...props }, ref) {
    if (isLoading) {
        props.disabled = true;
    }

    return (
        <button ref={ref} className={cn(buttonStyles({ variant, size }), 'relative flex gap-2 items-center', className, isLoading && 'opacity-0')} {...props}>
            {children}
            {isLoading && <Loader className="animate-spin flex inset-x-0 h-full" />}
        </button>
    );
});

export const ButtonLink: React.FC<LinkProps & React.RefAttributes<HTMLAnchorElement> & VariantProps<typeof buttonStyles>> = ({
    variant,
    size,
    className,
    children,
    ...props
}) => {
    return (
        <Link className={cn(buttonStyles({ variant, size }), 'relative flex gap-2 items-center', className)} {...props}>
            {children}
        </Link>
    );
};
