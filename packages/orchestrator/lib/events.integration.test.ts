import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTestDbClient } from '@nangohq/scheduler';

import { envs } from './env.js';
import { TaskEventsHandler, taskEvents } from './events.js';

import type { Task } from '@nangohq/scheduler';

const dbClient = getTestDbClient();
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

    describe.each([taskEvents.taskCreated(mockTask), taskEvents.taskCompleted(mockTask)])('cross-process communication', (event) => {
        it('should receive task event from other emitter', async () => {
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
            const event = taskEvents.taskCreated(mockTask);
            eventsHandler.on(event, handler);

            for (let i = 0; i < 5; i++) {
                eventsHandler.onCallbacks['CREATED'](mockTask);
            }
            // Wait for debounce period to pass
            await new Promise((resolve) => setTimeout(resolve, delayMs + 1));

            // Call the callback again
            await new Promise((resolve) => {
                eventsHandler.onCallbacks['CREATED'](mockTask);
                eventsHandler.on(event, () => resolve(undefined));
            });

            expect(handler).toHaveBeenCalledTimes(2);
        });
    });
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
