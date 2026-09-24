import { describe, expect, it } from 'vitest';

import { validateTask } from './validate.js';

import type { Task } from '@nangohq/scheduler';

describe('validateTask', () => {
    it.each([undefined, 'custom'])('deserializes a scheduled function with variant %s and no activity log', (variant) => {
        const result = validateTask({
            id: '4a14038c-3a57-4a4d-bb9e-c8a5e85474ae',
            name: 'scheduled-function-task',
            groupKey: 'function:instance:123',
            groupMaxConcurrency: 1,
            state: 'STARTED',
            retryKey: null,
            retryCount: 0,
            retryMax: 0,
            ownerKey: null,
            heartbeatTimeoutSecs: 60,
            startsAfter: new Date(),
            createdToStartedTimeoutSecs: 30,
            startedToCompletedTimeoutSecs: 120,
            createdAt: new Date(),
            lastStateTransitionAt: new Date(),
            lastHeartbeatAt: new Date(),
            output: null,
            terminated: false,
            scheduleId: 'c1952e1f-b385-4db0-b4ef-a7ad52a034c9',
            payload: {
                type: 'function',
                functionConfigId: 123,
                functionName: 'my-function',
                connection: { id: 1, connection_id: 'C', provider_config_key: 'P', environment_id: 2 },
                trigger: { kind: 'schedule', input: null, connection: { connectionId: 'C', integrationId: 'P' } },
                variant,
                async: true
            }
        } as Task);

        const task = result.unwrap();
        expect(task.isFunction()).toBe(true);
        if (task.isFunction()) {
            expect(task).toMatchObject({
                functionConfigId: 123,
                async: true,
                attempt: 1,
                attemptMax: 1
            });
            expect(task.variant).toBe(variant);
            expect(task.activityLogId).toBeUndefined();
        }
    });

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
                functionConfigId: 123,
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
                functionConfigId: 123,
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
