import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities.js';
import type { WebhookArgs, ContinuousSyncArgs, InitialSyncArgs, ActionArgs } from './models/worker';

const DEFAULT_TIMEOUT = '24 hours';
const MAXIMUM_ATTEMPTS = 3;

const { reportFailure, routeSync, scheduleAndRouteSync, runAction, runWebhook } = proxyActivities<typeof activities>({
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

export async function webhook(args: WebhookArgs): Promise<boolean> {
    try {
        return await runWebhook(args);
    } catch (e: any) {
        await reportFailure(e, args, DEFAULT_TIMEOUT, MAXIMUM_ATTEMPTS);

        return false;
    }
}
