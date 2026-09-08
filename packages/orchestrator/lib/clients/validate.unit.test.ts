import { describe, expect, it } from 'vitest';

import { validateTask } from './validate.js';

import type { Task } from '@nangohq/scheduler';

describe('validateTask', () => {
    it('deserializes a dequeued function task', () => {
        const result = validateTask({
            id: '4a14038c-3a57-4a4d-bb9e-c8a5e85474ae',
            name: 'function-task',
            groupKey: 'function:environment:2:connection:1:function:my-function',
            groupMaxConcurrency: 1,
            state: 'STARTED',
            retryKey: 'retry-key',
            retryCount: 0,
            retryMax: 2,
            ownerKey: 'environment:2',
            heartbeatTimeoutSecs: 60,
            startsAfter: new Date(),
            createdToStartedTimeoutSecs: 30,
            startedToCompletedTimeoutSecs: 120,
            createdAt: new Date(),
            lastStateTransitionAt: new Date(),
            lastHeartbeatAt: new Date(),
            output: null,
            terminated: false,
            scheduleId: null,
            payload: {
                type: 'function',
                functionName: 'my-function',
                activityLogId: 'activity-log-id',
                trigger: {
                    kind: 'http',
                    input: { value: 42 },
                    request: { method: 'POST', path: '/functions/invocations', headers: {}, query: {}, body: { value: 42 } },
                    subscriptions: ['issues'],
                    connection: { connectionId: 'connection-id', integrationId: 'integration-id' }
                },
                async: false,
                connection: {
                    id: 1,
                    connection_id: 'connection-id',
                    provider_config_key: 'integration-id',
                    environment_id: 2
                }
            }
        } as Task);

        const task = result.unwrap();
        expect(task.isFunction()).toBe(true);
        if (task.isFunction()) {
            expect(task).toMatchObject({
                functionName: 'my-function',
                trigger: expect.objectContaining({ kind: 'http', input: { value: 42 }, subscriptions: ['issues'] }),
                async: false,
                attempt: 1,
                attemptMax: 3
            });
        }
    });

    it.each(['GET', 'DELETE'] as const)('deserializes a body-less %s function task', (method) => {
        const result = validateTask({
            id: '4a14038c-3a57-4a4d-bb9e-c8a5e85474ae',
            name: 'function-task',
            groupKey: 'function:environment:2:connection:1:function:my-function',
            groupMaxConcurrency: 1,
            state: 'STARTED',
            retryKey: 'retry-key',
            retryCount: 0,
            retryMax: 2,
            ownerKey: 'environment:2',
            heartbeatTimeoutSecs: 60,
            startsAfter: new Date(),
            createdToStartedTimeoutSecs: 30,
            startedToCompletedTimeoutSecs: 120,
            createdAt: new Date(),
            lastStateTransitionAt: new Date(),
            lastHeartbeatAt: new Date(),
            output: null,
            terminated: false,
            scheduleId: null,
            payload: {
                type: 'function',
                functionName: 'my-function',
                activityLogId: 'activity-log-id',
                trigger: {
                    kind: 'http',
                    request: { method, path: '/webhooks/github', headers: {}, query: {} },
                    connection: { connectionId: 'connection-id', integrationId: 'integration-id' }
                },
                async: false,
                connection: {
                    id: 1,
                    connection_id: 'connection-id',
                    provider_config_key: 'integration-id',
                    environment_id: 2
                }
            }
        } as Task);

        const task = result.unwrap();
        expect(task.isFunction()).toBe(true);
        if (task.isFunction()) {
            expect(task.trigger).toStrictEqual({
                kind: 'http',
                input: null,
                request: { method, path: '/webhooks/github', headers: {}, query: {}, body: null },
                subscriptions: [],
                connection: { connectionId: 'connection-id', integrationId: 'integration-id' }
            });
        }
    });
});
