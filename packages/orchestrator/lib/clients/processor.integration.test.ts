import { expect, describe, it, beforeAll, afterAll, vi } from 'vitest';
import { getTestDbClient, Scheduler } from '@nangohq/scheduler';
import { getServer } from '../server.js';
import { OrchestratorClient } from './client.js';
import { OrchestratorProcessor } from './processor.js';
import getPort from 'get-port';
import { EventsHandler } from '../events.js';
import { Err, Ok, nanoid } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';
import type { OrchestratorTask } from './types.js';
import { tracer } from 'dd-trace';
import { setTimeout } from 'timers/promises';

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

describe('OrchestratorProcessor', () => {
    const server = getServer(scheduler, eventsHandler);

    beforeAll(async () => {
        await dbClient.migrate();
        server.listen(port);
    });

    afterAll(async () => {
        scheduler.stop();
        await dbClient.clearDatabase();
    });

    it('should process tasks', async () => {
        const groupKey = nanoid();
        const mockProcess = vi.fn(async (): Promise<Result<void>> => Promise.resolve(Ok(undefined)));
        const n = 10;
        await processN(mockProcess, groupKey, n);

        expect(mockProcess).toHaveBeenCalledTimes(n);
        const tasks = await scheduler.searchTasks({ groupKey });
        for (const task of tasks.unwrap()) {
            expect(task.state).toBe('STARTED');
        }
    });
    it('should process tasks and mark them as failed if processing failed', async () => {
        const groupKey = nanoid();
        const mockProcess = vi.fn(async (): Promise<Result<void>> => Promise.resolve(Err('Failed')));
        const n = 10;
        await processN(mockProcess, groupKey, n);

        expect(mockProcess).toHaveBeenCalledTimes(n);
        const tasks = await scheduler.searchTasks({ groupKey });
        for (const task of tasks.unwrap()) {
            expect(task.state).toBe('FAILED');
        }
    });
});

async function processN(handler: (task: OrchestratorTask) => Promise<Result<void>>, groupKey: string, n: number) {
    const processor = new OrchestratorProcessor({
        handler,
        opts: { orchestratorClient, groupKey, maxConcurrency: n, checkForTerminatedInterval: 100 }
    });
    processor.start({ tracer });
    for (let i = 0; i < n; i++) {
        await immediateTask({ groupKey });
    }
    // Wait so the processor can process all tasks
    while (processor.queueSize() > 0) {
        await setTimeout(100);
    }
    await setTimeout(100);

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
            activityLogId: '1234',
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
