import { setTimeout } from 'timers/promises';

import { afterAll, beforeAll, describe, it, vi } from 'vitest';

import { getTestDbClient, Scheduler } from '@nangohq/scheduler';
import { Err, nanoid, Ok } from '@nangohq/utils';

import { TaskEventsHandler } from '../events.js';
import { getServer } from '../server.js';
import { OrchestratorClient } from './client.js';
import { OrchestratorProcessor } from './processor.js';

import type { OrchestratorTask } from './types.js';
import type { Task } from '@nangohq/scheduler';
import type { Result } from '@nangohq/utils';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const dbClient = getTestDbClient();
const taskEventsHandler = new TaskEventsHandler(dbClient.db);
const scheduler = new Scheduler({
    db: dbClient.db,
    on: taskEventsHandler.onCallbacks,
    onError: () => {}
});
let orchestratorClient: OrchestratorClient;

describe('OrchestratorProcessor', () => {
    const server = getServer(scheduler, taskEventsHandler);
    let httpServer: Server;

    beforeAll(async () => {
        await dbClient.migrate();
        httpServer = server.listen(0);
        const address = await new Promise<AddressInfo>((resolve) => {
            httpServer.once('listening', () => resolve(httpServer.address() as AddressInfo));
        });
        orchestratorClient = new OrchestratorClient({ baseUrl: `http://localhost:${address.port}` });
    });

    afterAll(async () => {
        scheduler.stop();
        await setTimeout(100); // wait for the scheduler to stop
        httpServer?.close();
        await dbClient.clearDatabase();
    });

    it('should process tasks', async () => {
        await processN({
            handler: vi.fn(() => Promise.resolve(Ok(undefined))),
            groupKey: nanoid(),
            n: 10,
            waitUntil: (task) => task.state === 'STARTED'
        });
    }, 60_000);
    it('should process tasks and mark them as failed if processing failed', async () => {
        await processN({
            handler: vi.fn((): Promise<Result<void>> => Promise.resolve(Err('Failed'))),
            groupKey: nanoid(),
            n: 10,
            waitUntil: (task) => task.state === 'FAILED'
        });
    }, 60_000);
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
        orchestratorClient,
        groupKeyPattern: `${groupKey}*`, // using wildcard like the real processor
        maxConcurrency: n
    });
    processor.start();
    await setTimeout(100);

    for (let i = 0; i < n; i++) {
        await immediateTask({ groupKey });
    }

    let tasks: Task[] = [];
    let success = false;

    while (!success) {
        tasks = (await scheduler.searchTasks({ groupKey })).unwrap();

        if (tasks.length === n && tasks.every(waitUntil)) {
            success = true;
        } else {
            await setTimeout(100);
        }
    }

    await processor.stop();
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
