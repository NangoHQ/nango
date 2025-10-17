import { cn } from '@/utils/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="skeleton" className={cn('bg-bg-elevated animate-pulse rounded', className)} {...props} />;
}

export { Skeleton };
