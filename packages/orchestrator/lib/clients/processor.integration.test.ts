import { expect, describe, it, beforeAll, afterAll, vi } from 'vitest';
import { getTestDbClient, Scheduler } from '@nangohq/scheduler';
import { getServer } from '../server.js';
import { OrchestratorClient } from './client.js';
import { OrchestratorProcessor } from './processor.js';
import getPort from 'get-port';
import { EventsHandler } from '../events.js';
import { Ok, Err, nanoid } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { JsonValue } from 'type-fest';
import type { OrchestratorTask } from './types.js';
import { tracer } from 'dd-trace';

const dbClient = getTestDbClient();
const eventsHandler = new EventsHandler({
    CREATED: () => {},
    STARTED: () => {},
    SUCCEEDED: () => {},
    FAILED: () => {},
    EXPIRED: () => {},
    CANCELLED: () => {}
});
const scheduler = new Scheduler({
    dbClient,
    on: eventsHandler.onCallbacks
});
const port = await getPort();
const orchestratorClient = new OrchestratorClient({ baseUrl: `http://localhost:${port}` });

describe('OrchestratorProcessor', async () => {
    const server = getServer(scheduler, eventsHandler);

    beforeAll(async () => {
        await dbClient.migrate();
        server.listen(port);
    });

    afterAll(async () => {
        scheduler.stop();
        await dbClient.clearDatabase();
    });

    it('should process tasks and mark them as successful if processing succeed', async () => {
        const groupKey = nanoid();
        const mockProcess = vi.fn(async (): Promise<Result<JsonValue>> => Ok({ foo: 'bar' }));
        const n = 10;
        await processN(mockProcess, groupKey, n);

        expect(mockProcess).toHaveBeenCalledTimes(n);
        const tasks = await scheduler.searchTasks({ groupKey });
        for (const task of tasks.unwrap()) {
            expect(task.state).toBe('SUCCEEDED');
        }
    });
    it('should process tasks and mark them as failed if processing failed', async () => {
        const groupKey = nanoid();
        const mockProcess = vi.fn(async (): Promise<Result<JsonValue>> => Err('Failed'));
        const n = 10;
        await processN(mockProcess, groupKey, n);

        expect(mockProcess).toHaveBeenCalledTimes(n);
        const tasks = await scheduler.searchTasks({ groupKey });
        for (const task of tasks.unwrap()) {
            expect(task.state).toBe('FAILED');
        }
    });
    it('should cancel terminated tasks', async () => {
        const groupKey = nanoid();
        const mockAbort = vi.fn((_taskId: string) => {});
        const mockProcess = vi.fn(async (task: OrchestratorTask): Promise<Result<JsonValue>> => {
            let aborted = false;
            task.abortController.signal.onabort = () => {
                aborted = true;
                mockAbort(task.id);
            };
            await new Promise((resolve) => setTimeout(resolve, 500));
            if (aborted) {
                return Err('Aborted');
            }
            return Ok({ foo: 'bar' });
        });

        // Cancel all tasks after 100 ms
        const cancellingTimeout = setTimeout(async () => {
            const tasks = await scheduler.searchTasks({ groupKey });
            for (const task of tasks.unwrap()) {
                await scheduler.cancel({ taskId: task.id, reason: { message: 'Cancelling task' } });
            }
        }, 100);
        const n = 5;
        await processN(mockProcess, groupKey, n);

        expect(mockProcess).toHaveBeenCalledTimes(n);
        const tasks = await scheduler.searchTasks({ groupKey, state: 'CANCELLED' });
        for (const task of tasks.unwrap()) {
            expect(mockAbort).toHaveBeenCalledWith(task.id);
        }
        clearTimeout(cancellingTimeout);
    });
});

async function processN(handler: (task: OrchestratorTask) => Promise<Result<JsonValue>>, groupKey: string, n: number) {
    const processor = new OrchestratorProcessor({
        handler,
        opts: { orchestratorClient, groupKey, maxConcurrency: n, checkForTerminatedInterval: 100 }
    });
    processor.start({ tracer });
    for (let i = 0; i < n; i++) {
        await immediateTask({ groupKey });
    }
    // Wait so the processor can process all tasks
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return processor;
}

async function immediateTask({ groupKey }: { groupKey: string }) {
    return scheduler.immediate({
        groupKey,
        name: nanoid(),
        retryMax: 0,
        retryCount: 0,
        createdToStartedTimeoutSecs: 30,
        startedToCompletedTimeoutSecs: 30,
        heartbeatTimeoutSecs: 30,
        payload: {
            type: 'action',
            activityLogId: 1234,
            actionName: 'Task',
            connection: {
                id: 1234,
                connection_id: 'C',
                provider_config_key: 'P',
                environment_id: 5678
            },
            input: { foo: 'bar' }
        }
    });
}
