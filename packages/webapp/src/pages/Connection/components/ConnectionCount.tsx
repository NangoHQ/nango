import { Dot } from '@/components-v2/Dot';
import { Skeleton } from '@/components-v2/ui/skeleton';
import { useConnectionsCount } from '@/hooks/useConnections';
import { useStore } from '@/store';
import { cn } from '@/utils/utils';

import type { HTMLAttributes } from 'react';

type ConnectionCountProps = HTMLAttributes<HTMLDivElement>;

export const ConnectionCount = ({ className, ...rest }: ConnectionCountProps) => {
    const env = useStore((state) => state.env);
    const { data: connectionsCount, loading: connectionsCountLoading } = useConnectionsCount(env);

    if (connectionsCountLoading) {
        return <Skeleton className={cn('w-48 h-6', className)} />;
    }

    const { total, withError } = connectionsCount?.data ?? { total: 0, withError: 0 };

    return (
        <div className={cn('inline-flex items-center gap-1.5', className)} {...rest}>
            <Dot variant="error" />
            <span className="text-text-tertiary text-body-medium-medium">
                {total} connections ({withError} errored)
            </span>
        </div>
    );
};
