import { expect, describe, it, beforeAll, afterAll } from 'vitest';
import type { Task } from '@nangohq/scheduler';
import { getTestDbClient, Scheduler } from '@nangohq/scheduler';
import { getServer } from '../server.js';
import { OrchestratorClient } from './client.js';
import getPort from 'get-port';
import { EventsHandler } from '../events.js';
import { nanoid } from '@nangohq/utils';

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

    describe('recurring schedule', () => {
        it('should be created', async () => {
            const res = await client.recurring({
                name: nanoid(),
                state: 'STARTED',
                startsAt: new Date(),
                frequencyMs: 300_000,
                groupKey: nanoid(),
                retry: { max: 0 },
                timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
                args: {
                    type: 'sync',
                    syncId: 'sync-a',
                    syncName: nanoid(),
                    syncJobId: 5678,
                    connection: {
                        id: 123,
                        connection_id: 'C',
                        provider_config_key: 'P',
                        environment_id: 456
                    },
                    debug: false
                }
            });
            expect(res.isOk()).toBe(true);
        });
        it('should be updatable', async () => {
            const name = nanoid();
            await client.recurring({
                name,
                state: 'STARTED',
                startsAt: new Date(),
                frequencyMs: 300_000,
                groupKey: nanoid(),
                retry: { max: 0 },
                timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
                args: {
                    type: 'sync',
                    syncId: 'sync-a',
                    syncName: nanoid(),
                    syncJobId: 5678,
                    connection: {
                        id: 123,
                        connection_id: 'C',
                        provider_config_key: 'P',
                        environment_id: 456
                    },
                    debug: false
                }
            });

            const res = await client.updateSyncFrequency({ scheduleName: name, frequencyMs: 600_000 });
            expect(res.isOk()).toBe(true);
        });
        it('should be paused/unpaused/deleted', async () => {
            const scheduleName = nanoid();
            await client.recurring({
                name: scheduleName,
                state: 'STARTED',
                startsAt: new Date(),
                frequencyMs: 300_000,
                groupKey: nanoid(),
                retry: { max: 0 },
                timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
                args: {
                    type: 'sync',
                    syncId: 'sync-a',
                    syncName: nanoid(),
                    syncJobId: 5678,
                    connection: {
                        id: 123,
                        connection_id: 'C',
                        provider_config_key: 'P',
                        environment_id: 456
                    },
                    debug: false
                }
            });
            const paused = await client.pauseSync({ scheduleName });
            expect(paused.isOk(), `pausing failed ${JSON.stringify(paused)}`).toBe(true);
            const unpaused = await client.unpauseSync({ scheduleName });
            expect(unpaused.isOk(), `pausing failed ${JSON.stringify(unpaused)}`).toBe(true);
            const deleted = await client.deleteSync({ scheduleName });
            expect(deleted.isOk(), `pausing failed ${JSON.stringify(deleted)}`).toBe(true);
        });
        it('should be searchable', async () => {
            const name = nanoid();
            await client.recurring({
                name,
                state: 'STARTED',
                startsAt: new Date(),
                frequencyMs: 300_000,
                groupKey: nanoid(),
                retry: { max: 0 },
                timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
                args: {
                    type: 'sync',
                    syncId: 'sync-a',
                    syncName: nanoid(),
                    syncJobId: 5678,
                    connection: {
                        id: 123,
                        connection_id: 'C',
                        provider_config_key: 'P',
                        environment_id: 456
                    },
                    debug: false
                }
            });
            const res = (await client.searchSchedules({ scheduleNames: [name], limit: 1 })).unwrap();
            expect(res.length).toBe(1);
            expect(res[0]?.name).toBe(name);
        });
    });

    describe('heartbeat', () => {
        it('should be successful', async () => {
            const scheduledTask = await client.immediate({
                name: nanoid(),
                groupKey: nanoid(),
                retry: { count: 0, max: 0 },
                timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
                args: {
                    type: 'action',
                    actionName: nanoid(),
                    connection: {
                        id: 123,
                        connection_id: 'C',
                        provider_config_key: 'P',
                        environment_id: 456
                    },
                    activityLogId: 789,
                    input: { foo: 'bar' }
                }
            });
            const taskId = scheduledTask.unwrap().taskId;
            const beforeTask = await scheduler.get({ taskId });
            const res = await client.heartbeat({ taskId });
            const after = await scheduler.get({ taskId });

            expect(res.isOk(), `heartbeat failed: ${res.isErr() ? JSON.stringify(res.error) : ''}`).toBe(true);
            expect(after.unwrap().lastHeartbeatAt.getTime()).toBeGreaterThan(beforeTask.unwrap().lastHeartbeatAt.getTime());
        });
    });

    describe('executeAction', () => {
        it('should be successful when action task succeed', async () => {
            const groupKey = nanoid();
            const output = { count: 9 };

            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    await scheduler.succeed({ taskId: task.id, output });
                }
            });
            try {
                const res = await client.executeAction({
                    name: nanoid(),
                    groupKey: groupKey,
                    args: {
                        actionName: 'Action',
                        connection: {
                            id: 1234,
                            connection_id: 'C',
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
            const groupKey = nanoid();

            const errorPayload = { message: 'something bad happened' };
            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    await scheduler.fail({ taskId: task.id, error: errorPayload });
                }
            });
            try {
                const res = await client.executeAction({
                    name: nanoid(),
                    groupKey: groupKey,
                    args: {
                        actionName: 'Action',
                        connection: {
                            id: 1234,
                            connection_id: 'C',
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
            const groupKey = nanoid();
            const output = { count: 9 };

            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    await scheduler.succeed({ taskId: task.id, output });
                }
            });
            try {
                const res = await client.executeWebhook({
                    name: nanoid(),
                    groupKey: groupKey,
                    args: {
                        webhookName: 'W',
                        parentSyncName: 'parent',
                        connection: {
                            id: 1234,
                            connection_id: 'C',
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
            const groupKey = nanoid();

            const errorPayload = { message: 'something bad happened' };
            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    await scheduler.fail({ taskId: task.id, error: errorPayload });
                }
            });
            try {
                const res = await client.executeWebhook({
                    name: nanoid(),
                    groupKey: groupKey,
                    args: {
                        webhookName: 'W',
                        parentSyncName: nanoid(),
                        connection: {
                            id: 1234,
                            connection_id: 'C',
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
    describe('succeed', () => {
        it('should support big output', async () => {
            const groupKey = nanoid();
            const actionA = await client.immediate({
                name: nanoid(),
                groupKey,
                retry: { count: 0, max: 0 },
                timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
                args: {
                    type: 'action',
                    actionName: `A`,
                    connection: {
                        id: 123,
                        connection_id: 'C',
                        provider_config_key: 'P',
                        environment_id: 456
                    },
                    activityLogId: 789,
                    input: { foo: 'bar' }
                }
            });
            await client.dequeue({ groupKey, limit: 1, longPolling: false });
            const res = await client.succeed({ taskId: actionA.unwrap().taskId, output: { a: 'a'.repeat(10_000_000) } });
            expect(res.isOk()).toBe(true);
        });
    });
    describe('search', () => {
        it('should returns task by ids', async () => {
            const groupKey = nanoid();
            const actionA = await client.immediate({
                name: nanoid(),
                groupKey,
                retry: { count: 0, max: 0 },
                timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
                args: {
                    type: 'action',
                    actionName: `A`,
                    connection: {
                        id: 123,
                        connection_id: 'C',
                        provider_config_key: 'P',
                        environment_id: 456
                    },
                    activityLogId: 789,
                    input: { foo: 'bar' }
                }
            });
            const actionB = await client.immediate({
                name: nanoid(),
                groupKey,
                retry: { count: 0, max: 0 },
                timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
                args: {
                    type: 'action',
                    actionName: `A`,
                    connection: {
                        id: 123,
                        connection_id: 'C',
                        provider_config_key: 'P',
                        environment_id: 456
                    },
                    activityLogId: 789,
                    input: { foo: 'bar' }
                }
            });
            const ids = [actionA.unwrap().taskId, actionB.unwrap().taskId];
            const res = await client.searchTasks({ ids });
            expect(res.unwrap().length).toBe(2);
            expect(res.unwrap().map((task) => task.id)).toEqual(ids);
        });
    });
    describe('dequeue', () => {
        it('should returns nothing if no scheduled task', async () => {
            const res = await client.dequeue({ groupKey: 'abc', limit: 1, longPolling: false });
            expect(res.unwrap()).toEqual([]);
        });
        it('should return scheduled tasks', async () => {
            const groupKey = nanoid();
            const scheduledAction = await client.immediate({
                name: nanoid(),
                groupKey,
                retry: { count: 0, max: 0 },
                timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
                args: {
                    type: 'action',
                    actionName: `A`,
                    connection: {
                        id: 123,
                        connection_id: 'C',
                        provider_config_key: 'P',
                        environment_id: 456
                    },
                    activityLogId: 789,
                    input: { foo: 'bar' }
                }
            });
            const scheduledWebhook = await client.immediate({
                name: nanoid(),
                groupKey,
                retry: { count: 0, max: 0 },
                timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
                args: {
                    type: 'webhook',
                    webhookName: `webhook-a`,
                    parentSyncName: 'parent',
                    connection: {
                        id: 123,
                        connection_id: 'C',
                        provider_config_key: 'P',
                        environment_id: 456
                    },
                    activityLogId: 789,
                    input: { foo: 'bar' }
                }
            });
            const res = await client.dequeue({ groupKey, limit: 2, longPolling: false });
            expect(res.unwrap().length).toBe(2);
            expect(res.unwrap()[0]?.isAction()).toBe(true);
            expect(res.unwrap()[1]?.isWebhook()).toBe(true);
            expect(res.unwrap().map((task) => task.id)).toEqual([scheduledAction.unwrap().taskId, scheduledWebhook.unwrap().taskId]);
        });
    });
});

class MockProcessor {
    private interval;

    constructor({ groupKey, process }: { groupKey: string; process: (task: Task) => void }) {
        this.interval = setInterval(async () => {
            const tasks = (await scheduler.searchTasks({ groupKey })).unwrap();
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
