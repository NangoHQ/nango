import { Slot } from '@radix-ui/react-slot';
import { IconLoader2 } from '@tabler/icons-react';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils.js';

import type { VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:ring-offset-neutral-950 dark:focus-visible:ring-neutral-300',
    {
        variants: {
            variant: {
                default:
                    'bg-primary-light text-on-primary-light dark:bg-primary-dark dark:text-on-primary-dark hover:bg-primary-light/90 dark:hover:bg-primary-dark/90',
                transparent:
                    'text-secondary-light dark:text-secondary-dark hover:text-primary-light dark:hover:text-primary-dark focus:text-primary-light dark:focus:text-secondary-dark'
            },
            size: {
                default: 'h-10 px-4 py-2',
                sm: 'h-9 rounded-md px-3',
                lg: 'h-11 rounded-md px-8',
                icon: 'h-fit w-fit'
            }
        },
        defaultVariants: {
            variant: 'default',
            size: 'default'
        }
    }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
    loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, loading, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
        <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} disabled={loading || props.disabled}>
            {loading && <IconLoader2 className="mr-2 animate-spin" size={15} />}
            {children}
        </Comp>
    );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
