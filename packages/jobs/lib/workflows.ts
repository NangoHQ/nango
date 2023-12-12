import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities.js';
import type { ContinuousSyncArgs, InitialSyncArgs, ActionArgs } from './models/worker';

const DEFAULT_TIMEOUT = '24 hours';
const MAXIMUM_ATTEMPTS = 3;

const { reportFailure, routeSync, scheduleAndRouteSync, runAction } = proxyActivities<typeof activities>({
    startToCloseTimeout: DEFAULT_TIMEOUT,
    scheduleToCloseTimeout: DEFAULT_TIMEOUT,
    retry: {
        initialInterval: '5m',
        maximumAttempts: MAXIMUM_ATTEMPTS
    },
    heartbeatTimeout: '30m'
});

export async function initialSync(args: InitialSyncArgs): Promise<boolean | object | null> {
    try {
        return await routeSync(args);
    } catch (e: any) {
        await reportFailure(e, args, DEFAULT_TIMEOUT, MAXIMUM_ATTEMPTS);

        return false;
    }
}

export async function continuousSync(args: ContinuousSyncArgs): Promise<boolean | object | null> {
    try {
        return await scheduleAndRouteSync(args);
    } catch (e: any) {
        await reportFailure(e, args, DEFAULT_TIMEOUT, MAXIMUM_ATTEMPTS);

        return false;
    }
}

export async function action(args: ActionArgs): Promise<object> {
    try {
        return await runAction(args);
    } catch (e: any) {
        await reportFailure(e, args, DEFAULT_TIMEOUT, MAXIMUM_ATTEMPTS);

        return { success: false };
    }
}
