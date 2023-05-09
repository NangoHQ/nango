import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities.js';
import type { ContinuousSyncArgs } from './models/Worker';

const { routeSync, scheduleAndRouteSync } = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute'
});

export async function initialSync(args: { syncId: number; frequencyInMs?: number }): Promise<boolean> {
    return routeSync(args.syncId);
}

export async function continuousSync(args: ContinuousSyncArgs): Promise<boolean> {
    return scheduleAndRouteSync(args);
}
