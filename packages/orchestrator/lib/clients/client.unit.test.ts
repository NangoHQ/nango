import { afterEach, describe, expect, it, vi } from 'vitest';

import { OrchestratorClient } from './client.js';

import type { ImmediateProps } from './types.js';

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

describe('OrchestratorClient retry policy', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('does not retry duplicate-name conflicts returned by the server', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    error: {
                        code: 'immediate_failed',
                        message: 'task already exists',
                        payload: { reason: 'duplicate_task_name', taskName: 'task-1' }
                    }
                }),
                { status: 409, headers: { 'content-type': 'application/json' } }
            )
        );
        vi.stubGlobal('fetch', fetchMock);

        const client = new OrchestratorClient({ baseUrl: 'http://orchestrator.test' });
        const res = await client.immediate(buildImmediateRequest());

        expect(res.isErr()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('still retries transient 5xx responses', async () => {
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
});
