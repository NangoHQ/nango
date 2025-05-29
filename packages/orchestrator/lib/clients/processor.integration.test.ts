import { describe, it, beforeAll, afterAll, vi } from 'vitest';
import type { Task } from '@nangohq/scheduler';
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
        await setTimeout(100); // wait for the scheduler to stop
        await dbClient.clearDatabase();
    });

    it('should process tasks', async () => {
        await processN({
            handler: vi.fn(() => Promise.resolve(Ok(undefined))),
            groupKey: nanoid(),
            n: 10,
            waitUntil: (task) => task.state === 'STARTED'
        });
    });
    it('should process tasks and mark them as failed if processing failed', async () => {
        await processN({
            handler: vi.fn((): Promise<Result<void>> => Promise.resolve(Err('Failed'))),
            groupKey: nanoid(),
            n: 10,
            waitUntil: (task) => task.state === 'FAILED'
        });
    });
});

async function processN({
    handler,
    groupKey,
    n,
    waitUntil
}: {
    handler: (task: OrchestratorTask) => Promise<Result<void>>;
    groupKey: string;
    n: number;
    waitUntil: (task: Task) => boolean;
}) {
    const processor = new OrchestratorProcessor({
        handler,
        opts: { orchestratorClient, groupKey, maxConcurrency: n }
    });
    processor.start({ tracer });

    for (let i = 0; i < n; i++) {
        await immediateTask({ groupKey });
    }

    let processed = false;
    const start = Date.now();
    const timeout = 3_000;
    while (!processed) {
        await setTimeout(100);
        const tasks = (await scheduler.searchTasks({ groupKey })).unwrap();
        processed = tasks.every(waitUntil);
        if (!processed && Date.now() - start > timeout) {
            throw new Error(`Timeout: expected ${n} tasks to be processed, but tasks are still in states: ${tasks.map((task) => task.state).join(', ')}`);
        }
    }

    processor.stop();
    return processor;
}

async function immediateTask({ groupKey }: { groupKey: string }) {
    return scheduler.immediate({
        groupKey,
        groupMaxConcurrency: 0,
        name: nanoid(),
        retryMax: 0,
        retryCount: 0,
        ownerKey: null,
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
