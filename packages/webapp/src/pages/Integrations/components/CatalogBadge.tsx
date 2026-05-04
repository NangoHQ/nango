import { cva } from 'class-variance-authority';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const badgeVariants = cva('w-fit font-mono px-2 py-0.5 rounded bg-bg-surface !text-body-extra-small-semi', {
    variants: {
        variant: {
            dark: 'bg-bg-surface  text-text-secondary',
            light: 'bg-bg-subtle  text-text-primary',
            red: 'bg-feedback-error-fg/30 text-red-300',
            success: 'bg-feedback-success-fg/30 text-green-500',
            warning: 'bg-feedback-warning-fg/30 text-yellow-500',
            error: 'bg-feedback-error-fg/30 text-red-500',
            info: 'bg-feedback-info-fg/30 text-feedback-info-fg'
        }
    },
    defaultVariants: {
        variant: 'dark'
    }
});

export const CatalogBadge: React.FC<VariantProps<typeof badgeVariants> & { children: React.ReactNode; className?: string }> = ({
    children,
    className,
    variant
}) => {
    return <div className={cn(badgeVariants({ variant }), className)}>{children}</div>;
};
