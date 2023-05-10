import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities.js';
import type { ContinuousSyncArgs, InitialSyncArgs } from './models/Worker';

const { routeSync, scheduleAndRouteSync } = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute'
});

export async function initialSync(args: InitialSyncArgs): Promise<boolean> {
    return routeSync(args);
}

export async function continuousSync(args: ContinuousSyncArgs): Promise<boolean> {
    return scheduleAndRouteSync(args);
}
