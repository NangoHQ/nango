import { expect, describe, it, beforeAll, afterAll } from 'vitest';
import type { Task } from '@nangohq/scheduler';
import { getTestDbClient, Scheduler } from '@nangohq/scheduler';
import { getServer } from './server.js';
import { OrchestratorClient } from './client.js';
import getPort from 'get-port';
import { EventsHandler } from './events.js';

const dbClient = getTestDbClient();
const eventsHandler = new EventsHandler({
    CREATED: (task) => console.log(`Task ${task.id} created`),
    STARTED: (task) => console.log(`Task ${task.id} started`),
    SUCCEEDED: (task) => console.log(`Task ${task.id} succeeded`),
    FAILED: (task) => console.log(`Task ${task.id} failed`),
    EXPIRED: (task) => console.log(`Task ${task.id} expired`),
    CANCELLED: (task) => console.log(`Task ${task.id} cancelled`)
});
const scheduler = new Scheduler({
    dbClient,
    on: eventsHandler.onCallbacks
});

describe('OrchestratorClient', async () => {
    const server = getServer(scheduler, eventsHandler);
    const port = await getPort();
    const client = new OrchestratorClient({ baseUrl: `http://localhost:${port}` });

    beforeAll(async () => {
        await dbClient.migrate();
        server.listen(port);
    });

    afterAll(async () => {
        scheduler.stop();
        await dbClient.clearDatabase();
    });

    describe('executeAction', () => {
        it('should be successful when action task succeed', async () => {
            const groupKey = rndStr();
            const output = { count: 9 };

            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    await scheduler.succeed({ taskId: task.id, output });
                }
            });
            try {
                const res = await client.executeAction({
                    name: 'Task',
                    groupKey: groupKey,
                    args: {
                        name: 'Action',
                        connection: {
                            id: 1234,
                            provider_config_key: 'P',
                            environment_id: 5678
                        },
                        activityLogId: 9876,
                        input: { foo: 'bar' }
                    }
                });
                expect(res.unwrap()).toEqual(output);
            } finally {
                processor.stop();
            }
        });
        it('should return an error if action task fails', async () => {
            const groupKey = rndStr();

            const errorPayload = { message: 'something bad happened' };
            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    await scheduler.fail({ taskId: task.id, error: errorPayload });
                }
            });
            try {
                const res = await client.executeAction({
                    name: 'Task',
                    groupKey: groupKey,
                    args: {
                        name: 'Action',
                        connection: {
                            id: 1234,
                            provider_config_key: 'P',
                            environment_id: 5678
                        },
                        activityLogId: 9876,
                        input: { foo: 'bar' }
                    }
                });
                expect(res.isOk()).toBe(false);
                if (res.isErr()) {
                    expect(res.error.payload).toBe(res.error.payload);
                }
            } finally {
                processor.stop();
            }
        });
    });
    describe('executeWebhook', () => {
        it('should be successful when action task succeed', async () => {
            const groupKey = rndStr();
            const output = { count: 9 };

            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    await scheduler.succeed({ taskId: task.id, output });
                }
            });
            try {
                const res = await client.executeWebhook({
                    name: 'Task',
                    groupKey: groupKey,
                    args: {
                        name: 'Action',
                        parentSyncName: 'parent',
                        connection: {
                            id: 1234,
                            provider_config_key: 'P',
                            environment_id: 5678
                        },
                        activityLogId: 9876,
                        input: { foo: 'bar' }
                    }
                });
                expect(res.unwrap()).toEqual(output);
            } finally {
                processor.stop();
            }
        });
        it('should return an error if action task fails', async () => {
            const groupKey = rndStr();

            const errorPayload = { message: 'something bad happened' };
            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    await scheduler.fail({ taskId: task.id, error: errorPayload });
                }
            });
            try {
                const res = await client.executeWebhook({
                    name: 'Task',
                    groupKey: groupKey,
                    args: {
                        name: 'Action',
                        parentSyncName: rndStr(),
                        connection: {
                            id: 1234,
                            provider_config_key: 'P',
                            environment_id: 5678
                        },
                        activityLogId: 9876,
                        input: { foo: 'bar' }
                    }
                });
                expect(res.isOk()).toBe(false);
                if (res.isErr()) {
                    expect(res.error.payload).toBe(res.error.payload);
                }
            } finally {
                processor.stop();
            }
        });
    });
});

class MockProcessor {
    private interval;

    constructor({ groupKey, process }: { groupKey: string; process: (task: Task) => void }) {
        this.interval = setInterval(async () => {
            const tasks = (await scheduler.list({ groupKey })).unwrap();
            for (const task of tasks) {
                switch (task.state) {
                    case 'CREATED':
                        scheduler.dequeue({ groupKey, limit: 1 });
                        break;
                    case 'STARTED':
                        process(task);
                        break;
                }
            }
        }, 100);
    }

    stop() {
        clearTimeout(this.interval);
    }
}

function rndStr() {
    return Math.random().toString(36).substring(7);
}
