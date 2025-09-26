import { cn } from '@/utils/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="skeleton" className={cn('bg-neutral-100 animate-pulse rounded-md dark:bg-neutral-800', className)} {...props} />;
}

export { Skeleton };
