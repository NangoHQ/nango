import { cva } from 'class-variance-authority';

import { cn } from '@/utils/utils';

import type { VariantProps } from 'class-variance-authority';

const keyValueBadgeVariants = cva('px-2 py-0.5 rounded-xs !text-body-small-medium', {
    variants: {
        variant: {
            darker: 'bg-bg-surface text-text-primary',
            lighter: 'bg-bg-subtle text-text-secondary'
        }
    },
    defaultVariants: {
        variant: 'darker'
    }
});

interface KeyValueBadgeProps extends VariantProps<typeof keyValueBadgeVariants> {
    label: string;
    children: React.ReactNode;
    className?: string;
}

export const KeyValueBadge: React.FC<KeyValueBadgeProps> = ({ label, children, className, variant }) => {
    return (
        <div className={cn(keyValueBadgeVariants({ variant }), className)}>
            <span className="text-text-tertiary">{label}:</span> {children}
        </div>
    );
};
