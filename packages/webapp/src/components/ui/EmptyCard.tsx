import { cn } from '@/utils/utils';

export const EmptyCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
    return <div className={cn('min-h-65 flex flex-col items-center justify-center gap-5 p-20 bg-surface-panel rounded-md', className)}>{children}</div>;
};
