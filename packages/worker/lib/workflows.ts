import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities.js';
import type { ContinuousSyncArgs, InitialSyncArgs, ActionArgs } from './models/Worker';

const DEFAULT_TIMEOUT = '24 hours';

const { reportFailure, routeSync, scheduleAndRouteSync, runAction } = proxyActivities<typeof activities>({
    startToCloseTimeout: DEFAULT_TIMEOUT,
    scheduleToCloseTimeout: DEFAULT_TIMEOUT,
    retry: {
        initialInterval: '5m',
        maximumAttempts: 3
    },
    heartbeatTimeout: '30m'
});

export async function initialSync(args: InitialSyncArgs): Promise<boolean | object | null> {
    try {
        return await routeSync(args);
    } catch (e: any) {
        await reportFailure(e, args);

        return false;
    }
}

export async function continuousSync(args: ContinuousSyncArgs): Promise<boolean | object | null> {
    try {
        return await scheduleAndRouteSync(args);
    } catch (e: any) {
        await reportFailure(e, args);

        return false;
    }
}

export async function action(args: ActionArgs): Promise<object> {
    try {
        return await runAction(args);
    } catch (e: any) {
        await reportFailure(e, args);

        return { success: false };
    }
}
