import { StatusIndicator } from '@nangohq/design-system';

import type { StatusIndicatorProps } from '@nangohq/design-system';
import type { OperationState } from '@nangohq/types';

const states: Record<OperationState, { label: string; tone: StatusIndicatorProps['tone'] }> = {
    success: { label: 'Success', tone: 'success' },
    failed: { label: 'Failed', tone: 'danger' },
    timeout: { label: 'Timeout', tone: 'warning' },
    running: { label: 'Running', tone: 'info' },
    waiting: { label: 'Waiting', tone: 'muted' },
    cancelled: { label: 'Cancelled', tone: 'muted' }
};

export const OperationStatus: React.FC<{ state: OperationState }> = ({ state }) => {
    const { label, tone } = states[state];
    return (
        <StatusIndicator tone={tone} pulse={state === 'running'}>
            {label}
        </StatusIndicator>
    );
};
