import { cva } from 'class-variance-authority';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const badgeVariants = cva('font-mono px-2 py-0.5 rounded-xs bg-bg-surface text-text-secondary !text-body-extra-small-semi', {
    variants: {
        variant: {
            dark: 'bg-bg-surface',
            light: 'bg-bg-subtle',
            red: 'bg-feedback-error-fg/30 text-red-300'
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
