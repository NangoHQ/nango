import { proxyActivities } from '@temporalio/workflow';
// Only import the activity types
import type * as activities from './activities.js';

const { syncGithub } = proxyActivities<typeof activities>({
    startToCloseTimeout: '1 minute'
});

/** A workflow that simply calls an activity */
export async function continuousSync(args: { syncId: number; frequencyInMs?: number }): Promise<boolean> {
    const response = await syncGithub(args.syncId);

    return response;
}
