import { cn } from '@/utils/utils';

export const EmptyCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
    return <div className={cn('h-65 flex flex-col items-center justify-center gap-5 p-20 bg-bg-elevated rounded-md', className)}>{children}</div>;
};
