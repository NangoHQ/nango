import * as React from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../../utils/utils';

const alertVariants = cva('relative w-full rounded-lg border px-2 py-2 text-sm flex gap-2.5 items-start min-h-10', {
    variants: {
        variant: {
            default: 'bg-blue-base-35 border-blue-base text-blue-base',
            destructive: 'bg-red-base-35 border-red-base text-red-base',
            warning: 'bg-yellow-base-35 border-yellow-base text-yellow-base'
        }
    },
    defaultVariants: {
        variant: 'default'
    }
});

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>(
    ({ className, variant, ...props }, ref) => <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn('font-semibold', className)} {...props} />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
