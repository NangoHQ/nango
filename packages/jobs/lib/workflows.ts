import type { ActivityFailure } from '@temporalio/workflow';
import { CancellationScope, proxyActivities, isCancellation } from '@temporalio/workflow';
import type * as activities from './activities.js';
import type { WebhookArgs, PostConnectionScriptArgs, ContinuousSyncArgs, InitialSyncArgs, ActionArgs, RunnerOutput } from '@nangohq/shared';
import { ACTION_MAX_ATTEMPTS, ACTION_TIMEOUT, SYNC_MAX_ATTEMPTS, SYNC_TIMEOUT, WEBHOOK_MAX_ATTEMPTS, WEBHOOK_TIMEOUT } from '@nangohq/utils';

const { routeSync, scheduleAndRouteSync } = proxyActivities<typeof activities>({
    // 1 hour to start so syncs are not evicted from the queue too soon
    // 24 hours to complete to allow for long running syncs
    scheduleToStartTimeout: '1h',
    startToCloseTimeout: SYNC_TIMEOUT,
    retry: {
        maximumAttempts: SYNC_MAX_ATTEMPTS
    },
    heartbeatTimeout: '30m'
});
const { runAction, reportFailure: reportActionFailure } = proxyActivities<typeof activities>({
    // actions are more time sensitive, hence shorter timeout
    // actions are synchronous so no retry and fast eviction from the queue
    scheduleToStartTimeout: '1m',
    startToCloseTimeout: ACTION_TIMEOUT,
    retry: {
        maximumAttempts: ACTION_MAX_ATTEMPTS
    }
});

const { runWebhook, runPostConnectionScript } = proxyActivities<typeof activities>({
    // webhook execution should be fast, hence shorter startToCloseTimeout
    // but we allow for longer time to start so events are not evicted too soon if system is busy
    scheduleToStartTimeout: '1h',
    startToCloseTimeout: WEBHOOK_TIMEOUT,
    retry: {
        maximumAttempts: WEBHOOK_MAX_ATTEMPTS
    }
});

const { cancelActivity, reportFailure } = proxyActivities<typeof activities>({
    scheduleToStartTimeout: '5m',
    startToCloseTimeout: '30s',
    retry: {
        maximumAttempts: 3
    }
});

export async function initialSync(args: InitialSyncArgs): Promise<boolean | object | null> {
    try {
        return await routeSync(args);
    } catch (e) {
        if (isCancellation(e)) {
            await CancellationScope.nonCancellable(() => cancelActivity(args));

            return false;
        }
        await reportFailure(e, args, SYNC_TIMEOUT, SYNC_MAX_ATTEMPTS);

        return false;
    }
}

export async function continuousSync(args: ContinuousSyncArgs): Promise<boolean | object | null> {
    try {
        const result = await scheduleAndRouteSync(args);

        return result;
    } catch (e) {
        if (isCancellation(e)) {
            await CancellationScope.nonCancellable(() => cancelActivity(args));

            return { cancelled: true };
        }
        await reportFailure(e, args, SYNC_TIMEOUT, SYNC_MAX_ATTEMPTS);

        return false;
    }
}

export async function action(args: ActionArgs): Promise<RunnerOutput> {
    try {
        return await runAction(args);
    } catch (err) {
        await reportActionFailure(err, args, ACTION_TIMEOUT, ACTION_MAX_ATTEMPTS);

        return {
            success: false,
            error: {
                type: 'nango_internal_error',
                status: 500,
                payload: { message: (err as ActivityFailure).cause?.message }
            },
            response: null
        };
    }
}

export async function webhook(args: WebhookArgs): Promise<boolean> {
    try {
        return await runWebhook(args);
    } catch (err) {
        await reportFailure(err, args, WEBHOOK_TIMEOUT, WEBHOOK_MAX_ATTEMPTS);

        return false;
    }
}

export async function postConnectionScript(args: PostConnectionScriptArgs): Promise<RunnerOutput> {
    try {
        return await runPostConnectionScript(args);
    } catch (err) {
        await reportFailure(err, args, WEBHOOK_TIMEOUT, WEBHOOK_MAX_ATTEMPTS);

        return {
            success: false,
            error: {
                type: 'nango_internal_error',
                status: 500,
                payload: { message: (err as ActivityFailure).cause?.message }
            },
            response: null
        };
    }
}
