import { cva } from 'class-variance-authority';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const badgeVariants = cva('w-fit font-mono text-xs px-2 py-0.5 rounded bg-surface-canvas', {
    variants: {
        variant: {
            dark: 'bg-surface-canvas  text-text-secondary',
            light: 'bg-surface-panel-inset  text-text-strong',
            red: 'bg-status-danger-bg text-status-danger-text',
            success: 'bg-status-success-bg text-status-success-text',
            warning: 'bg-status-warning-bg text-status-warning-text',
            error: 'bg-status-danger-bg text-status-danger-text',
            info: 'bg-status-info-bg text-status-info-text'
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
