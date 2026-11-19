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
                functionUuid: '11111111-1111-4111-8111-111111111111',
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
                functionUuid: '11111111-1111-4111-8111-111111111111',
                async: true,
                attempt: 1,
                attemptMax: 1
            });
            expect(task.variant).toBe(variant);
            expect(task.activityLogId).toBeUndefined();
        }
    });

    it.each(['11111111-1111-4111-8111-111111111111', 'ca7a10c0-9582-8b46-8c47-f39eee45f2b3'])(
        'deserializes a dequeued function task with UUID %s',
        (functionUuid) => {
            const result = validateTask({
                id: '4a14038c-3a57-4a4d-bb9e-c8a5e85474ae',
                name: 'function-task',
                groupKey: `function:environment:2:connection:1:function:${functionUuid}`,
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
                    functionUuid,
                    activityLogId: 'activity-log-id',
                    trigger: {
                        kind: 'http',
                        input: { value: 42 },
                        request: {
                            method: 'POST',
                            path: `/connections/22222222-2222-4222-8222-222222222222/functions/${functionUuid}/invocations`,
                            headers: {},
                            query: {},
                            body: { value: 42 }
                        },
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
                    functionUuid,
                    async: false,
                    attempt: 1,
                    attemptMax: 3
                });
                expect(task.trigger).toMatchObject({ kind: 'http', input: { value: 42 }, subscriptions: ['issues'] });
            }
        }
    );

    it.each(['GET', 'DELETE'] as const)('deserializes a body-less %s function task', (method) => {
        const result = validateTask({
            id: '4a14038c-3a57-4a4d-bb9e-c8a5e85474ae',
            name: 'function-task',
            groupKey: 'function:environment:2:connection:1:function:11111111-1111-4111-8111-111111111111',
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
                functionUuid: '11111111-1111-4111-8111-111111111111',
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

    describe('function source', () => {
        const inlineTask = (payload: Record<string, unknown>) =>
            validateTask({
                id: '4a14038c-3a57-4a4d-bb9e-c8a5e85474ae',
                name: 'inline-function-task',
                groupKey: 'function:environment:2:connection:1:inline',
                groupMaxConcurrency: 5,
                state: 'STARTED',
                retryKey: 'retry-key',
                retryCount: 0,
                retryMax: 0,
                ownerKey: 'environment:2',
                heartbeatTimeoutSecs: 60,
                startsAfter: new Date(),
                createdToStartedTimeoutSecs: 30,
                startedToCompletedTimeoutSecs: 30,
                createdAt: new Date(),
                lastStateTransitionAt: new Date(),
                lastHeartbeatAt: new Date(),
                output: null,
                terminated: false,
                scheduleId: null,
                payload: {
                    type: 'function',
                    activityLogId: 'activity-log-id',
                    trigger: { kind: 'invoke', input: { value: 42 }, connection: { connectionId: 'connection-id', integrationId: 'integration-id' } },
                    async: false,
                    connection: { id: 1, connection_id: 'connection-id', provider_config_key: 'integration-id', environment_id: 2 },
                    ...payload
                }
            } as Task);

        it('deserializes a function task that carries its source', () => {
            const task = inlineTask({ source: { kind: 'inline', code: 'return record.value;' } }).unwrap();

            expect(task.isFunction()).toBe(true);
            if (task.isFunction()) {
                expect(task.source).toStrictEqual({ kind: 'inline', code: 'return record.value;' });
                expect(task.functionUuid).toBeUndefined();
                expect('functionUuid' in task).toBe(false);
            }
        });

        it('keeps the description of the source', () => {
            const source = { kind: 'inline', code: 'return record.value;', description: 'Names of the unread emails' };
            const task = inlineTask({ source }).unwrap();

            expect(task.isFunction() && task.source).toStrictEqual(source);
        });

        it.each([
            ['both a functionUuid and a source', { functionUuid: '11111111-1111-4111-8111-111111111111', source: { kind: 'inline', code: 'return 1;' } }],
            ['neither a functionUuid nor a source', {}],
            ['an empty source', { source: { kind: 'inline', code: '' } }],
            ['an empty source description', { source: { kind: 'inline', code: 'return 1;', description: '' } }],
            ['an unknown source kind', { source: { kind: 'remote', code: 'return 1;' } }]
        ])('rejects a function task with %s', (_name, payload) => {
            expect(inlineTask(payload).isErr()).toBe(true);
        });
    });
});
