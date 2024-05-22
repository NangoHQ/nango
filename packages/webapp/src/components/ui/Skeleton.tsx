import { cn } from '../../utils/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('animate-pulse rounded-md bg-gray-600 h-4', className)} {...props} />;
}

export { Skeleton };
