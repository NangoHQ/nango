import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDbClient } from '@nangohq/scheduler';

import { envs } from './env.js';
import { TaskEventsHandler, taskEvents } from './events.js';

import type { Task } from '@nangohq/scheduler';

const dbClient = getTestDbClient();
const mockActionTask: Task = {
    id: '00000000-0000-0000-0000-000000000000',
    name: 'task-name',
    groupKey: 'taskGroup:myKey',
    state: 'CREATED',
    createdAt: new Date(),
    lastHeartbeatAt: new Date(),
    retryCount: 0,
    output: null,
    terminated: false,
    groupMaxConcurrency: 1,
    retryKey: 'retry-key',
    retryMax: 3,
    startsAfter: new Date(),
    createdToStartedTimeoutSecs: 60,
    startedToCompletedTimeoutSecs: 60,
    heartbeatTimeoutSecs: 30,
    lastStateTransitionAt: new Date(),
    scheduleId: null,
    ownerKey: 'owner-key',
    payload: {
        connection: {
            id: 1,
            connection_id: 'conn-id-123',
            provider_config_key: 'config-key-123',
            environment_id: 1
        },
        type: 'action',
        actionName: 'myAction',
        activityLogId: 'log-123',
        input: { foo: 'bar' },
        async: false
    }
};

describe('TaskEventsHandler', () => {
    let eventsHandler: TaskEventsHandler;

    beforeEach(async () => {
        await dbClient.migrate();
        eventsHandler = new TaskEventsHandler(dbClient.db);
        await eventsHandler.connect();
    });

    afterEach(async () => {
        await eventsHandler.disconnect();
        await dbClient.clearDatabase();
    });

    describe('emit', () => {
        it('should throw error for empty event name', () => {
            expect(() => eventsHandler.emit('')).toThrow('Event name must be a non-empty string');
        });

        it('should throw error for non-string event', () => {
            expect(() => eventsHandler.emit(123 as any)).toThrow('Event name must be a non-empty string');
        });

        it('should emit locally when not connected', async () => {
            await eventsHandler.disconnect();

            const localEmitSpy = vi.spyOn(eventsHandler, 'emitLocally');
            eventsHandler.emit('test-event');

            expect(localEmitSpy).toHaveBeenCalledWith('test-event');
        });

        it('should handle payload too large error', async () => {
            const largeEvent = 'x'.repeat(9000);
            await new Promise((resolve) => {
                eventsHandler.on('payloadTooLarge', () => resolve(undefined));
                eventsHandler.emit(largeEvent);
            });
        });
    });

    describe('emitLocally', () => {
        it('should return true when listeners exist', () => {
            const handler = vi.fn();
            eventsHandler.on('test-event', handler);

            const result = eventsHandler.emitLocally('test-event', 'arg1');

            expect(result).toBe(true);
            expect(handler).toHaveBeenCalledWith('arg1');
        });

        it('should return false when no listeners exist', () => {
            const result = eventsHandler.emitLocally('test-event', 'arg1');
            expect(result).toBe(false);
        });
    });

    describe('connection management', () => {
        it('should emit connected event on successful connection', async () => {
            const newEmitter = new TaskEventsHandler(dbClient.db);

            await new Promise((resolve) => {
                newEmitter.on('connected', () => {
                    newEmitter.disconnect();
                });
                newEmitter.connect().finally(() => resolve(undefined));
            });
        });

        it('should handle disconnection gracefully', async () => {
            const disconnectedHandler = vi.fn();
            eventsHandler.on('disconnected', disconnectedHandler);

            await eventsHandler.disconnect();

            expect(disconnectedHandler).toHaveBeenCalled();
        });
    });

    describe.each([taskEvents.taskCreated(mockActionTask), taskEvents.taskCompleted(mockActionTask)])('cross-process communication', (event) => {
        it('should receive task event from other emitter', async () => {
            if (!event) {
                throw new Error('Event is undefined');
            }
            const emitter2 = new TaskEventsHandler(dbClient.db);
            await emitter2.connect();

            await new Promise((resolve) => {
                eventsHandler.on(event, () => {
                    emitter2.disconnect();
                    resolve(undefined);
                });
                emitter2.emit(event);
            });
        });
    });

    describe('should debounce', () => {
        it('multiple task created events into a single event', async () => {
            const delayMs = envs.ORCHESTRATOR_TASK_CREATED_EVENT_DEBOUNCE_MS;
            const handler = vi.fn();
            const event = taskEvents.taskCreated(mockActionTask);
            eventsHandler.on(event, handler);

            for (let i = 0; i < 5; i++) {
                eventsHandler.onCallbacks['CREATED'](mockActionTask);
            }
            // Wait for debounce period to pass
            await new Promise((resolve) => setTimeout(resolve, delayMs + 1));

            // Call the callback again
            await new Promise((resolve) => {
                eventsHandler.onCallbacks['CREATED'](mockActionTask);
                eventsHandler.on(event, () => resolve(undefined));
            });

            expect(handler).toHaveBeenCalledTimes(2);
        });
    });
});

describe('taskEvents', () => {
    describe('taskCreated', () => {
        it('should generate event from task object', () => {
            const eventName = taskEvents.taskCreated(mockActionTask);
            expect(eventName).toBe('task:created:taskGroup');
        });

        it('should generate event from string', () => {
            const eventName = taskEvents.taskCreated('myGroup');
            expect(eventName).toBe('task:created:myGroup');
        });
    });

    describe('taskCompleted', () => {
        it('should generate event name from string', () => {
            const eventName = taskEvents.taskCompleted('task-456');
            expect(eventName).toBe('task:completed:task-456');
        });
        it('should generate event from action task', () => {
            const eventName = taskEvents.taskCompleted(mockActionTask);
            expect(eventName).toBe('task:completed:00000000-0000-0000-0000-000000000000');
        });
        it('should generate event from onEvent task', () => {
            const onEventTask: Task = {
                ...mockActionTask,
                id: '00000000-0000-0000-0000-000000000000',
                payload: {
                    connection: {
                        id: 1,
                        connection_id: 'conn-id-123',
                        provider_config_key: 'config-key-123',
                        environment_id: 1
                    },
                    type: 'on-event',
                    onEventName: 'myEvent',
                    activityLogId: 'log-123',
                    fileLocation: 'path/to/file',
                    sdkVersion: '0.0.0',
                    version: '0.0.0'
                }
            };
            const eventName = taskEvents.taskCompleted(onEventTask);
            expect(eventName).toBe('task:completed:00000000-0000-0000-0000-000000000000');
        });
        it('should not generate event for sync task', () => {
            const syncTask: Task = {
                ...mockActionTask,
                id: '00000000-0000-0000-0000-000000000000',
                payload: {
                    connection: {
                        id: 1,
                        connection_id: 'conn-id-123',
                        provider_config_key: 'config-key-123',
                        environment_id: 1
                    },
                    type: 'sync',
                    syncId: 'sync-id-123',
                    syncName: 'mySync',
                    activityLogId: 'log-123',
                    debug: false
                }
            };
            const eventName = taskEvents.taskCompleted(syncTask);
            expect(eventName).toBeUndefined();
        });

        it('should not generate event for webhook task', () => {
            const webhookTask: Task = {
                ...mockActionTask,
                id: '00000000-0000-0000-0000-000000000000',
                payload: {
                    connection: {
                        id: 1,
                        connection_id: 'conn-id-123',
                        provider_config_key: 'config-key-123',
                        environment_id: 1
                    },
                    type: 'webhook',
                    webhookName: 'myWebhook',
                    parentSyncName: 'mySync',
                    activityLogId: 'log-123',
                    input: { foo: 'bar' }
                }
            };
            const eventName = taskEvents.taskCompleted(webhookTask);
            expect(eventName).toBeUndefined();
        });
    });
});
