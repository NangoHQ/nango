import { Dot } from '@/components-v2/Dot';
import { cn } from '@/utils/utils';

import type { ApiDownWatchResponse } from '@/hooks/useApiDownWatch';

const statusVariants = {
    operational: {
        text: 'Operational',
        variant: 'success'
    },
    degraded_performance: {
        text: 'Degraded Performance',
        variant: 'warning'
    },
    major_outage: {
        text: 'Major Outage',
        variant: 'error'
    },
    unknown: {
        text: 'Unknown',
        variant: null
    }
} as const;

export function StatusWidget({ status, className = '' }: { status: ApiDownWatchResponse['status']; className?: string }) {
    const variant = statusVariants[status].variant;
    return (
        <div className="inline-flex items-center gap-1">
            <span className={cn('text-text-primary !text-body-medium-regular', className)}>{statusVariants[status].text}</span>
            {variant && <Dot variant={variant} />}
        </div>
    );
}
