import { EventEmitter } from 'node:events';

import getPort from 'get-port';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemorySlidingWindowRateLimiter } from '@nangohq/kvstore';
import { Ok } from '@nangohq/utils';

import { getServer } from '../../server.js';

import type { Scheduler } from '@nangohq/scheduler';
import type { Server } from 'node:http';

const immediate = vi.fn((props: { name: string }) => Promise.resolve(Ok({ id: `task-${props.name}`, retryKey: `retry-${props.name}` })));
const immediateBatch = vi.fn((propsList: { name: string }[]) =>
    Promise.resolve(
        Ok({
            created: propsList.map((props) => ({ ...props, id: `task-${props.name}`, retryKey: `retry-${props.name}` })),
            discarded: []
        })
    )
);
const scheduler = { immediate, immediateBatch } as unknown as Scheduler;
const rateLimiter = new InMemorySlidingWindowRateLimiter({ keyPrefix: 'throttled-immediate-route-test', limit: 2, windowMs: 60_000 });
const port = await getPort();
const baseUrl = `http://localhost:${port}`;
let api: Server;

describe('throttled immediate routes', () => {
    beforeAll(() => {
        api = getServer(scheduler, new EventEmitter(), rateLimiter).listen(port);
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => api.close((err) => (err ? reject(err) : resolve())));
        await rateLimiter.destroy();
    });

    it('limits single requests by the caller-provided key', async () => {
        const responses = await Promise.all([
            post('/v1/throttled-immediate', buildTask('single-1', 'single-key')),
            post('/v1/throttled-immediate', buildTask('single-2', 'single-key'))
        ]);
        const limited = await post('/v1/throttled-immediate', buildTask('single-3', 'single-key'));

        expect(responses.map((response) => response.status)).toEqual([200, 200]);
        expect(limited.status).toBe(429);
        expect(limited.headers.get('retry-after')).toBeTruthy();
        await expect(limited.json()).resolves.toMatchObject({
            error: { code: 'rate_limit_exceeded', payload: { retryAfterMs: expect.any(Number) } }
        });
        expect(immediate).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['missing', withoutRateLimit(buildTask('missing-key', 'unused'))],
        ['empty', buildTask('empty-key', '')]
    ])('rejects a %s rate limit key', async (_case, task) => {
        const response = await post('/v1/throttled-immediate', task);

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: 'invalid_request',
                errors: [expect.objectContaining({ path: ['rateLimitKey'] })]
            }
        });
        expect(immediate).not.toHaveBeenCalled();
    });

    it('partially admits batches independently per key and preserves result order', async () => {
        const response = await post('/v1/throttled-immediate/batch', {
            tasks: [buildTask('a-1', 'batch-a'), buildTask('b-1', 'batch-b'), buildTask('a-2', 'batch-a'), buildTask('a-3', 'batch-a')]
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            results: [
                { taskId: 'task-a-1', retryKey: 'retry-a-1' },
                { taskId: 'task-b-1', retryKey: 'retry-b-1' },
                { taskId: 'task-a-2', retryKey: 'retry-a-2' },
                {
                    error: {
                        code: 'rate_limit_exceeded',
                        message: 'Rate limit exceeded',
                        payload: { retryAfterMs: expect.any(Number) }
                    }
                }
            ]
        });
        expect(immediateBatch).toHaveBeenCalledOnce();
        expect(immediateBatch.mock.calls[0]![0].map((task) => task.name)).toEqual(['a-1', 'b-1', 'a-2']);
    });

    it('does not apply the limiter to the existing immediate route', async () => {
        const responses = await Promise.all([
            post('/v1/immediate', withoutRateLimit(buildTask('unlimited-1', 'unused'))),
            post('/v1/immediate', withoutRateLimit(buildTask('unlimited-2', 'unused'))),
            post('/v1/immediate', withoutRateLimit(buildTask('unlimited-3', 'unused')))
        ]);

        expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
        expect(immediate).toHaveBeenCalledTimes(3);
    });
});

function buildTask(name: string, rateLimitKey: string) {
    return {
        name,
        rateLimitKey,
        ownerKey: '',
        group: { key: 'group', maxConcurrency: 0 },
        retry: { count: 0, max: 0 },
        timeoutSettingsInSecs: { createdToStarted: 30, startedToCompleted: 30, heartbeat: 60 },
        args: {
            type: 'action',
            actionName: 'action',
            connection: { id: 1, connection_id: 'connection', provider_config_key: 'provider', environment_id: 1 },
            activityLogId: 'activity',
            input: {},
            async: false
        }
    };
}

function withoutRateLimit(task: ReturnType<typeof buildTask>) {
    const { rateLimitKey: _, ...immediateTask } = task;
    return immediateTask;
}

async function post(path: string, body: unknown): Promise<Response> {
    return await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });
}
