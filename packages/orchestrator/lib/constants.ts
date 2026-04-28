import type { ImmediateProps } from './clients/types.js';

export const serverRequestSizeLimit = '10mb';

export const webhookTaskSchedulingSettings = {
    retry: { count: 0, max: 0 },
    timeoutSettingsInSecs: {
        createdToStarted: 5 * 60,
        startedToCompleted: 60 * 60,
        heartbeat: 5 * 60
    }
} as const satisfies Pick<ImmediateProps, 'retry' | 'timeoutSettingsInSecs'>;
