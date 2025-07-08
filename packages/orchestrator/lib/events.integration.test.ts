import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDbClient } from '@nangohq/scheduler';

import { TaskEventsHandler, taskEvents } from './events.js';

import type { Task } from '@nangohq/scheduler';

const dbClient = getTestDbClient();
const mockCallbacks = {
    CREATED: vi.fn(),
    STARTED: vi.fn(),
    SUCCEEDED: vi.fn(),
    FAILED: vi.fn(),
    EXPIRED: vi.fn(),
    CANCELLED: vi.fn()
};
const mockTask: Task = {
    id: 'task-123',
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
    payload: {}
};

describe('TaskEventsHandler', () => {
    let eventsHandler: TaskEventsHandler;

    beforeEach(async () => {
        await dbClient.migrate();
        eventsHandler = new TaskEventsHandler(dbClient.db, { on: mockCallbacks });
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
            eventsHandler.emit('test-event', 'arg1', 'arg2');

            expect(localEmitSpy).toHaveBeenCalledWith('test-event', 'arg1', 'arg2');
        });

        it('should handle payload too large error', async () => {
            const largePayload = 'x'.repeat(9000);
            await new Promise((resolve) => {
                eventsHandler.on('payloadTooLarge', () => resolve(undefined));
                eventsHandler.emit('my-large-event', largePayload);
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
            const newEmitter = new TaskEventsHandler(dbClient.db, { on: mockCallbacks });

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

    describe.each([taskEvents.taskCreated(mockTask), taskEvents.taskStarted(mockTask), taskEvents.taskCompleted(mockTask)])(
        'cross-process communication',
        (event) => {
            it('should receive task event from other emitter', async () => {
                const emitter2 = new TaskEventsHandler(dbClient.db, { on: mockCallbacks });
                await emitter2.connect();

                await new Promise((resolve) => {
                    eventsHandler.on(event, (taskId: string) => {
                        expect(taskId).toBe(mockTask.id);
                        emitter2.disconnect();
                        resolve(undefined);
                    });
                    emitter2.emit(event, mockTask.id);
                });
            });
        }
    );
});

describe('taskEvents', () => {
    describe('taskCreated', () => {
        it('should generate event name from task object', () => {
            const eventName = taskEvents.taskCreated(mockTask);
            expect(eventName).toBe('task:created:taskGroup');
        });

        it('should generate event name from string', () => {
            const eventName = taskEvents.taskCreated('myGroup');
            expect(eventName).toBe('task:created:myGroup');
        });
    });

    describe('taskStarted', () => {
        it('should generate event name from task', () => {
            const eventName = taskEvents.taskStarted(mockTask);
            expect(eventName).toBe('task:started:task-123');
        });
    });

    describe('taskCompleted', () => {
        it('should generate event name from task object', () => {
            const eventName = taskEvents.taskCompleted(mockTask);
            expect(eventName).toBe('task:completed:task-123');
        });

        it('should generate event name from string', () => {
            const eventName = taskEvents.taskCompleted('task-456');
            expect(eventName).toBe('task:completed:task-456');
        });
    });
});
