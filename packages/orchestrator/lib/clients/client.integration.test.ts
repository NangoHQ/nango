import getPort from 'get-port';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Scheduler, getTestDbClient } from '@nangohq/scheduler';
import { nanoid } from '@nangohq/utils';

import { getServer } from '../server.js';
import { OrchestratorClient } from './client.js';
import { TaskEventsHandler } from '../events.js';

import type { PostImmediate } from '../routes/v1/postImmediate.js';
import type { Task } from '@nangohq/scheduler';
import type { Result } from '@nangohq/utils';

const dbClient = getTestDbClient();
const eventsHandler = new TaskEventsHandler(dbClient.db, {
    on: {
        CREATED: () => {},
        STARTED: () => {},
        SUCCEEDED: () => {},
        FAILED: () => {},
        EXPIRED: () => {},
        CANCELLED: () => {}
    }
});
const scheduler = new Scheduler({
    db: dbClient.db,
    on: eventsHandler.onCallbacks,
    onError: () => {}
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
                group: { key: nanoid(), maxConcurrency: 0 },
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
                group: { key: nanoid(), maxConcurrency: 0 },
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
                group: { key: nanoid(), maxConcurrency: 0 },
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
                group: { key: nanoid(), maxConcurrency: 0 },
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
            const scheduledTask = await immediateAction(client, { groupKey: nanoid() });
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
                    group: { key: groupKey, maxConcurrency: 0 },
                    args: {
                        actionName: 'Action',
                        connection: {
                            id: 1234,
                            connection_id: 'C',
                            provider_config_key: 'P',
                            environment_id: 5678
                        },
                        activityLogId: '9876',
                        input: { foo: 'bar' },
                        async: false
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
                    group: { key: groupKey, maxConcurrency: 0 },
                    args: {
                        actionName: 'Action',
                        connection: {
                            id: 1234,
                            connection_id: 'C',
                            provider_config_key: 'P',
                            environment_id: 5678
                        },
                        activityLogId: '9876',
                        input: { foo: 'bar' },
                        async: false
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
        it('should be successful', async () => {
            const groupKey = nanoid();

            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    await scheduler.succeed({ taskId: task.id, output: null });
                }
            });
            try {
                const res = await client.executeWebhook({
                    name: nanoid(),
                    group: { key: groupKey, maxConcurrency: 0 },
                    args: {
                        webhookName: 'W',
                        parentSyncName: 'parent',
                        connection: {
                            id: 1234,
                            connection_id: 'C',
                            provider_config_key: 'P',
                            environment_id: 5678
                        },
                        activityLogId: '9876',
                        input: { foo: 'bar' }
                    }
                });
                expect(res.isOk()).toBe(true);
            } finally {
                processor.stop();
            }
        });
    });
    describe('succeed', () => {
        it('should support big output', async () => {
            const groupKey = nanoid();
            const actionA = await immediateAction(client, { groupKey });
            await client.dequeue({ groupKey, limit: 1, longPolling: false });
            const res = await client.succeed({ taskId: actionA.unwrap().taskId, output: { a: 'a'.repeat(10_000_000) } });
            expect(res.isOk()).toBe(true);
        });
    });
    describe('search', () => {
        it('should returns task by ids', async () => {
            const groupKey = nanoid();
            const actionA = await immediateAction(client, { groupKey });
            const actionB = await immediateAction(client, { groupKey });
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
            const scheduledAction = await immediateAction(client, { groupKey });
            const scheduledWebhook = await client.immediate({
                name: nanoid(),
                group: { key: groupKey, maxConcurrency: 0 },
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
                    activityLogId: '789',
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
    describe('getRetryOutput', () => {
        it('should return null if retryKey does not exist', async () => {
            const res = (
                await client.getOutput({
                    retryKey: '00000000-0000-0000-0000-000000000000',
                    ownerKey: 'does-not-exist'
                })
            ).unwrap();
            expect(res).toBe(null);
        });
        it('should return null if owner key does not match', async () => {
            const groupKey = nanoid();
            const ownerKey = nanoid();
            const expectedOutput = { count: 9 };
            let processed = false;

            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    await scheduler.succeed({ taskId: task.id, output: expectedOutput });
                    processed = true;
                }
            });
            try {
                const task = await immediateAction(client, { groupKey, ownerKey });
                const retryKey = task.unwrap().retryKey;
                expect(retryKey).not.toBeNull();

                while (!processed) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                const output = (await client.getOutput({ retryKey, ownerKey: 'another-owner' })).unwrap();
                expect(output).toEqual(null);
            } finally {
                processor.stop();
            }
        });
        it('should return the output of successful task (no retry)', async () => {
            const groupKey = nanoid();
            const ownerKey = nanoid();
            const expectedOutput = { count: 9 };
            let processed = false;

            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    await scheduler.succeed({ taskId: task.id, output: expectedOutput });
                    processed = true;
                }
            });
            try {
                const task = await immediateAction(client, { groupKey, ownerKey });
                const retryKey = task.unwrap().retryKey;
                expect(retryKey).not.toBeNull();

                while (!processed) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                const output = (await client.getOutput({ retryKey, ownerKey })).unwrap();
                expect(output).toEqual(expectedOutput);
            } finally {
                processor.stop();
            }
        });
        it('should return the output of successful retry', async () => {
            const groupKey = nanoid();
            const ownerKey = nanoid();
            const expectedOutput = { count: 9 };
            let processed = false;
            const retryMax = 3;

            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    if (task.retryCount === retryMax) {
                        await scheduler.succeed({ taskId: task.id, output: expectedOutput });
                        processed = true;
                    } else {
                        await scheduler.fail({ taskId: task.id, error: { message: 'it failed' } });
                    }
                }
            });
            try {
                const task = await immediateAction(client, { groupKey, ownerKey, retryMax });
                const retryKey = task.unwrap().retryKey;
                expect(retryKey).not.toBeNull();

                while (!processed) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                const output = (await client.getOutput({ retryKey, ownerKey })).unwrap();
                expect(output).toEqual(expectedOutput);
            } finally {
                processor.stop();
            }
        });
        it('should return error when task fails', async () => {
            const groupKey = nanoid();
            const ownerKey = nanoid();
            const expectedError = { message: 'it failed' };
            let processed = false;

            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    await scheduler.fail({ taskId: task.id, error: expectedError });
                    processed = true;
                }
            });
            try {
                const task = await immediateAction(client, { groupKey, ownerKey });
                const retryKey = task.unwrap().retryKey;
                expect(retryKey).not.toBeNull();

                while (!processed) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                const res = await client.getOutput({ retryKey, ownerKey });
                expect(res.isErr()).toBe(true);
                if (res.isErr()) {
                    expect(res.error.payload).toEqual(expectedError);
                }
            } finally {
                processor.stop();
            }
        });
        it('should return error when all attempts failed', async () => {
            const groupKey = nanoid();
            const ownerKey = nanoid();
            const expectedError = { message: 'it failed' };
            const retryMax = 3;
            let processed = false;

            const processor = new MockProcessor({
                groupKey,
                process: async (task) => {
                    await scheduler.fail({ taskId: task.id, error: expectedError });
                    if (task.retryCount === retryMax) {
                        processed = true;
                    }
                }
            });
            try {
                const task = await immediateAction(client, { groupKey, ownerKey, retryMax });
                const retryKey = task.unwrap().retryKey;
                expect(retryKey).not.toBeNull();

                while (!processed) {
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }

                const res = await client.getOutput({ retryKey, ownerKey });
                expect(res.isErr()).toBe(true);
                if (res.isErr()) {
                    expect(res.error.payload).toEqual(expectedError);
                }
            } finally {
                processor.stop();
            }
        });
    });
});

async function immediateAction(
    client: OrchestratorClient,
    props: { groupKey: string; retryMax?: number; ownerKey?: string | undefined }
): Promise<Result<PostImmediate['Success']>> {
    return client.immediate({
        name: nanoid(),
        group: { key: props.groupKey, maxConcurrency: 0 },
        retry: { count: 0, max: props.retryMax || 0 },
        ...(props.ownerKey ? { ownerKey: props.ownerKey } : {}),
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
            activityLogId: '789',
            input: { foo: 'bar' }
        }
    });
}

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
