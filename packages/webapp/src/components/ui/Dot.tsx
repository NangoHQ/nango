import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const dotVariants = cva('size-1.5 rounded-full', {
    variants: {
        variant: {
            brand: 'bg-status-info-icon',
            success: 'bg-status-success-icon',
            warning: 'bg-status-warning-icon',
            error: 'bg-status-danger-icon'
        }
    },
    defaultVariants: {
        variant: 'brand'
    }
});

export const Dot: React.FC<VariantProps<typeof dotVariants> & React.HTMLAttributes<HTMLDivElement>> = ({ variant, className, ...props }) => {
    return <div className={cn(dotVariants({ variant, className }))} {...props} />;
};
