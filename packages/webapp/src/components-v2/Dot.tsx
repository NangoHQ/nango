import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const dotVariants = cva('size-1.5 rounded-full', {
    variants: {
        variant: {
            brand: 'bg-feedback-info-fg',
            success: 'bg-feedback-success-fg',
            warning: 'bg-feedback-warning-fg',
            error: 'bg-feedback-error-fg'
        }
    },
    defaultVariants: {
        variant: 'brand'
    }
});

export const Dot: React.FC<VariantProps<typeof dotVariants> & React.HTMLAttributes<HTMLDivElement>> = ({ variant, className, ...props }) => {
    return <div className={cn(dotVariants({ variant, className }))} {...props} />;
};
