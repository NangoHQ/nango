import { cn } from '@/utils/utils';

interface IntegrationsBadgeProps {
    label: string;
    children: React.ReactNode;
    className?: string;
}

export const IntegrationsBadge: React.FC<IntegrationsBadgeProps> = ({ label, children, className }) => {
    return (
        <div className={cn('px-2 py-0.5 rounded-xs bg-bg-surface text-text-primary !text-body-small-medium', className)}>
            <span className="text-text-tertiary">{label}:</span> {children}
        </div>
    );
};
