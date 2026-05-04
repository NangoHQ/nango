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
