/* eslint-disable import/no-extraneous-dependencies, @typescript-eslint/no-unused-vars, @typescript-eslint/require-await */

// Sketch only: this is intentionally short and omits production details.
// It shows the shape of using @nangohq/scheduler directly from server.

import db from '@nangohq/database';
import { getRemoteFunctionNangoHost, invokeDryrun, parseDryrunSuccessOutput, remoteFunctionDryrunSandboxTimeoutMs } from '@nangohq/sandbox';
import { Scheduler, SchedulerWorker } from '@nangohq/scheduler';

import { createDryrunSandboxApiKey, toFunctionDryrunError } from './packages/server/lib/controllers/functions/dryrun/helpers.js';

const handlers = [
    {
        groupKeyPattern: 'dryrun:*',
        limit: 5,
        heartbeatIntervalMs: 10_000,
        toFailureOutput: (err) => ({
            status: 'failed',
            error: toFunctionDryrunError(err)
        }),
        handle: runDryrunTask
    },
    {
        groupKeyPattern: 'sync:*',
        limit: 10,
        heartbeatIntervalMs: 10_000,
        handle: runSyncTask,
        handleAbort: abortSyncTask
    }
];

// 1. Server startup: create scheduler against the normal Nango DB.
const scheduler = new Scheduler({
    db: db.knex,
    on: {
        CREATED: () => {},
        STARTED: () => {},
        SUCCEEDED: () => {},
        FAILED: () => {},
        EXPIRED: () => {},
        CANCELLED: () => {}
    },
    onError: (err) => console.error(err)
});

scheduler.start();

// 2. Server startup: register workers/handlers.
const worker = new SchedulerWorker({
    scheduler,
    pollIntervalMs: 1_000,
    handlers,
    onError: (err, ctx) => console.error({ err, ctx })
});

worker.start();

// 3. Handler: one scheduler task becomes one synchronous sandbox dryrun.
async function runDryrunTask(task) {
    const payload = task.payload as {
        environmentId: number;
        environmentName: string;
        parentCustomerKeyId: number;
        request: {
            integration_id: string;
            function_name: string;
            function_type: 'action' | 'sync';
            code: string;
            connection_id: string;
            input?: unknown;
            metadata?: Record<string, unknown>;
            checkpoint?: Record<string, unknown>;
            last_sync_date?: string;
        };
    };

    const startedAt = Date.now();
    const sandboxApiKey = await createDryrunSandboxApiKey(payload.parentCustomerKeyId, payload.environmentId, task.id);
    if (sandboxApiKey.isErr()) {
        throw sandboxApiKey.error;
    }

    const result = await invokeDryrun({
        ...payload.request,
        environment_name: payload.environmentName,
        nango_secret_key: sandboxApiKey.value,
        nango_host: getRemoteFunctionNangoHost()
    });

    const parsed = parseDryrunSuccessOutput(result.output);
    return {
        output: {
            status: 'success',
            output: parsed.output,
            duration_ms: Date.now() - startedAt,
            ...(parsed.hasResult ? { result: parsed.result } : {})
        }
    };
}

// 4. POST /functions/dryruns: queue a new dryrun and return the scheduler task id.
async function queueDryrun({ environment, parentCustomerKeyId, body }) {
    const timeoutSecs = Math.ceil(remoteFunctionDryrunSandboxTimeoutMs / 1000);

    const task = await scheduler.immediate({
        name: `dryrun:${crypto.randomUUID()}`,
        groupKey: `dryrun:${environment.id}`,
        payload: {
            environmentId: environment.id,
            environmentName: environment.name,
            parentCustomerKeyId,
            request: {
                ...body,
                function_name: 'function'
            }
        },
        groupMaxConcurrency: 0,
        retryMax: 0,
        retryCount: 0,
        createdToStartedTimeoutSecs: timeoutSecs,
        startedToCompletedTimeoutSecs: timeoutSecs,
        heartbeatTimeoutSecs: 60,
        ownerKey: null,
        retryKey: null
    });

    if (task.isErr()) {
        throw task.error;
    }

    return {
        id: task.value.id,
        status: 'waiting',
        created_at: task.value.createdAt.toISOString()
    };
}

// 5. Shutdown.
async function stopDryrunScheduler() {
    await worker.stop();
    await scheduler.stop();
}

async function runSyncTask(task) {
    return {
        output: {
            status: 'success',
            taskId: task.id
        }
    };
}

async function abortSyncTask(task) {
    const payload = task.payload as {
        abortedTask: {
            id: string;
            state: string;
        };
        reason: string;
    };

    return {
        output: {
            status: 'aborted',
            abortedTaskId: payload.abortedTask.id,
            reason: payload.reason
        }
    };
}
