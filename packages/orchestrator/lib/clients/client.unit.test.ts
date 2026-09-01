import { afterEach, describe, expect, it, vi } from 'vitest';

import { OrchestratorClient } from './client.js';

import type { ExecuteFunctionProps, ExecuteWebhookProps, ImmediateProps } from './types.js';

function buildImmediateRequest(): ImmediateProps {
    return {
        name: 'task-1',
        group: { key: 'group-1', maxConcurrency: 0 },
        retry: { count: 0, max: 0 },
        timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
        args: {
            type: 'action',
            actionName: 'action-1',
            connection: {
                id: 123,
                connection_id: 'connection-1',
                provider_config_key: 'provider-config-key-1',
                environment_id: 456
            },
            activityLogId: 'activity-log-1',
            input: { foo: 'bar' },
            async: false
        }
    };
}

describe('OrchestratorClient immediate', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('maps duplicate-name conflicts from the API while preserving existing retries', async () => {
        const fetchMock = vi.fn().mockImplementation(() => {
            return new Response(
                JSON.stringify({
                    error: {
                        code: 'duplicate_task_name',
                        message: 'task already exists'
                    }
                }),
                { status: 409, headers: { 'content-type': 'application/json' } }
            );
        });
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test' });
        const res = await client.immediate(buildImmediateRequest());

        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error.name).toBe('duplicate_task_name');
            expect(res.error.payload).toEqual({});
        }
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('retries transient 5xx responses', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ error: { code: 'server_error', message: 'temporary failure' } }), {
                    status: 500,
                    headers: { 'content-type': 'application/json' }
                })
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ error: { code: 'server_error', message: 'temporary failure' } }), {
                    status: 500,
                    headers: { 'content-type': 'application/json' }
                })
            )
            .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-1', retryKey: 'retry-key-1' }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test' });
        const res = await client.immediate(buildImmediateRequest());

        expect(res.isOk()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('preserves existing retries on non-immediate route errors', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: { code: 'schedule_not_found', message: 'missing schedule' } }), {
                status: 404,
                headers: { 'content-type': 'application/json' }
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test' });
        const res = await client.pauseSync({ scheduleName: 'schedule-1' });

        expect(res.isErr()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});

function buildWebhookProps(name: string): ExecuteWebhookProps {
    return {
        name,
        group: { key: 'webhook:environment:1', maxConcurrency: 0 },
        args: {
            webhookName: 'wh',
            parentSyncName: 'sync',
            connection: {
                id: 1,
                connection_id: 'c',
                provider_config_key: 'p',
                environment_id: 1
            },
            activityLogId: 'a',
            input: { foo: 'bar' }
        }
    };
}

function buildFunctionProps(async: boolean): ExecuteFunctionProps {
    return {
        name: 'function-task-1',
        group: { key: 'function:environment:456:connection:123:function:my-function', maxConcurrency: 0 },
        retry: { count: 0, max: 2 },
        args: {
            functionName: 'my-function',
            connection: {
                id: 123,
                connection_id: 'connection-1',
                provider_config_key: 'provider-config-key-1',
                environment_id: 456
            },
            activityLogId: 'activity-log-1',
            trigger: {
                kind: 'http',
                input: { foo: 'bar' },
                request: { method: 'POST', path: '/functions/invocations', headers: {}, query: {}, body: { foo: 'bar' } },
                connection: { connectionId: 'connection-1', integrationId: 'provider-config-key-1' }
            },
            async
        }
    };
}

describe('OrchestratorClient executeFunction', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('invoke a function task and waits for its output when not async', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ taskId: 'task-1', retryKey: 'retry-key-1' }), { status: 200, headers: { 'content-type': 'application/json' } })
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ state: 'SUCCEEDED', output: { ok: true } }), { status: 200, headers: { 'content-type': 'application/json' } })
            );
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test' });
        const res = await client.executeFunction(buildFunctionProps(false));

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            expect(res.value).toEqual({ kind: 'completed', output: { ok: true } });
        }

        const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
        expect(url).toBe('http://orchestrator.test/v1/immediate');
        const body = JSON.parse(init.body);
        expect(body.args).toMatchObject({ type: 'function', functionName: 'my-function', async: false });
        expect(body.timeoutSettingsInSecs).toEqual({ createdToStarted: 30, startedToCompleted: 2 * 60, heartbeat: 60 });
    });

    it('schedules a function task without waiting', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify({ taskId: 'task-1', retryKey: 'retry-key-1' }), { status: 200, headers: { 'content-type': 'application/json' } })
            );
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test' });
        const res = await client.executeFunction(buildFunctionProps(true));

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            expect(res.value).toEqual({ kind: 'scheduled', taskId: 'task-1', retryKey: 'retry-key-1' });
        }
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
        expect(url).toBe('http://orchestrator.test/v1/immediate');
        const body = JSON.parse(init.body);
        expect(body.args).toMatchObject({ type: 'function', functionName: 'my-function', async: true });
        expect(body.retry).toEqual({ count: 0, max: 2 });
        expect(body.timeoutSettingsInSecs).toEqual({ createdToStarted: 24 * 60 * 60, startedToCompleted: 15 * 60, heartbeat: 2 * 60 });
    });
});

describe('OrchestratorClient executeWebhookBatch', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('returns an empty array without calling fetch when given no props', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test' });
        const res = await client.executeWebhookBatch([]);

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            expect(res.value).toEqual([]);
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns per-entry success and duplicate-name failures in input order', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    results: [
                        { taskId: 't1', retryKey: 'r1' },
                        { error: { code: 'duplicate_task_name', message: 'already exists' } },
                        { taskId: 't3', retryKey: 'r3' }
                    ]
                }),
                { status: 200, headers: { 'content-type': 'application/json' } }
            )
        );
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test' });
        const res = await client.executeWebhookBatch([buildWebhookProps('a'), buildWebhookProps('b'), buildWebhookProps('c')]);

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            expect(res.value).toHaveLength(3);
            expect(res.value[0]!.isOk() && res.value[0].value).toEqual({ taskId: 't1', retryKey: 'r1' });
            expect(res.value[1]!.isErr() && res.value[1].error.name).toBe('duplicate_task_name');
            expect(res.value[2]!.isOk() && res.value[2].value).toEqual({ taskId: 't3', retryKey: 'r3' });
        }
        const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
        expect(JSON.parse(request.body as string).tasks[0].rateLimitKey).toBe('1');
    });

    it('returns per-entry rate limit failures with the suggested delay', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    results: [
                        {
                            error: {
                                code: 'rate_limit_exceeded',
                                message: 'Rate limit exceeded',
                                payload: { retryAfterMs: 1250 }
                            }
                        }
                    ]
                }),
                { status: 200, headers: { 'content-type': 'application/json' } }
            )
        );
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test' });
        const res = await client.executeWebhookBatch([buildWebhookProps('a')]);

        expect(res.isOk()).toBe(true);
        if (res.isOk()) {
            expect(res.value[0]!.isErr() && res.value[0].error).toMatchObject({
                name: 'rate_limit_exceeded',
                payload: { retryAfterMs: 1250 }
            });
        }
    });

    it('does not retry transient batch failures because each attempt consumes capacity', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: { code: 'server_error', message: 'temporary failure' } }), {
                status: 500,
                headers: { 'content-type': 'application/json' }
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test' });
        const res = await client.executeWebhookBatch([buildWebhookProps('a')]);

        expect(res.isErr()).toBe(true);
        expect(fetchMock).toHaveBeenCalledOnce();
    });
});

describe('OrchestratorClient executeWebhook', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('does not retry rate limit responses and exposes the suggested delay', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    error: {
                        code: 'rate_limit_exceeded',
                        message: 'Rate limit exceeded',
                        payload: { retryAfterMs: 1250 }
                    }
                }),
                { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '2' } }
            )
        );
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test' });
        const res = await client.executeWebhook(buildWebhookProps('a'));

        expect(res.isErr()).toBe(true);
        if (res.isErr()) {
            expect(res.error).toMatchObject({ name: 'rate_limit_exceeded', payload: { retryAfterMs: 1250 } });
        }
        expect(fetchMock).toHaveBeenCalledOnce();
        const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
        expect(JSON.parse(request.body as string).rateLimitKey).toBe('1');
    });

    it('does not retry transient failures because each attempt consumes capacity', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: { code: 'server_error', message: 'temporary failure' } }), {
                status: 500,
                headers: { 'content-type': 'application/json' }
            })
        );
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test' });
        const res = await client.executeWebhook(buildWebhookProps('a'));

        expect(res.isErr()).toBe(true);
        expect(fetchMock).toHaveBeenCalledOnce();
    });
});
