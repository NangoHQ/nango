import { StatusIndicator } from '@nangohq/design-system';

import type { StatusIndicatorProps } from '@nangohq/design-system';
import type { OperationState } from '@nangohq/types';

const states: Record<OperationState, { label: string; tone: StatusIndicatorProps['tone']; hollow?: boolean }> = {
    success: { label: 'Success', tone: 'success' },
    failed: { label: 'Failed', tone: 'danger' },
    timeout: { label: 'Timeout', tone: 'warning' },
    running: { label: 'Running', tone: 'info' },
    waiting: { label: 'Waiting', tone: 'neutral', hollow: true },
    cancelled: { label: 'Cancelled', tone: 'neutral' }
};

export const OperationStatus: React.FC<{ state: OperationState; withLabel?: boolean; animated?: boolean }> = ({ state, withLabel = true, animated = true }) => {
    const { label, tone, hollow } = states[state];
    return (
        <StatusIndicator tone={tone} hollow={hollow} pulse={animated && state === 'running'}>
            {withLabel && label}
        </StatusIndicator>
    );
};
