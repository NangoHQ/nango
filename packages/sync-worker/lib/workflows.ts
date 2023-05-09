import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities.js';

const { routeSync } = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute'
});

// TODO add logic for hourly schedule and frequency
export async function continuousSync(args: { syncId: number; frequencyInMs?: number }): Promise<boolean> {
    return routeSync(args.syncId);
}
