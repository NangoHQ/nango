import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities.js';
import type { ContinuousSyncArgs, InitialSyncArgs } from './models/Worker';

const { routeSync, scheduleAndRouteSync } = proxyActivities<typeof activities>({
    startToCloseTimeout: '30 minutes',
    scheduleToCloseTimeout: '30 minutes',
    retry: {
        initialInterval: '5m',
        maximumAttempts: 3
    }
});

export async function initialSync(args: InitialSyncArgs): Promise<boolean | object | string> {
    return routeSync(args);
}

export async function continuousSync(args: ContinuousSyncArgs): Promise<boolean | object | string> {
    return scheduleAndRouteSync(args);
}
