import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils.js';

import type { VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
    'inline-flex items-center cursor-pointer justify-center whitespace-nowrap rounded-md text-sm ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                default: 'bg-primary text-on-primary hover:bg-primary/90',
                transparent: 'text-text-tertiary hover:text-text-primary focus:text-text-primary'
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
            {loading && <LoaderCircle className="mr-2 animate-spin" size={15} />}
            {children}
        </Comp>
    );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
