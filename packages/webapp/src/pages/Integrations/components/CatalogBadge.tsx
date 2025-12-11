import { cn } from '@/utils/utils';

export const CatalogBadge: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
    return <div className={cn('px-2 py-0.5 rounded-xs bg-bg-surface text-text-secondary !text-body-extra-small-semi uppercase', className)}>{children}</div>;
};
