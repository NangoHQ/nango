import { EventEmitter } from 'node:events';

import getPort from 'get-port';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemorySlidingWindowRateLimiter } from '@nangohq/kvstore';
import { Err, Ok } from '@nangohq/utils';

import { getServer } from '../../server.js';

import type { Scheduler } from '@nangohq/scheduler';
import type { Server } from 'node:http';

const scheduleId = '01994dc2-b6a7-7e46-964d-5f520e57a082';
const recurring = vi.fn(() => Promise.resolve(Ok([{ id: scheduleId }])));
const scheduler = { recurring } as unknown as Scheduler;
const rateLimiter = new InMemorySlidingWindowRateLimiter({ keyPrefix: 'recurring-route-test', limit: 100, windowMs: 60_000 });
const port = await getPort();
let api: Server;

const functionArgs = {
    type: 'function',
    functionConfigId: 123,
    functionName: 'fetchIssues',
    connection: { id: 456, connection_id: 'customer-connection', provider_config_key: 'github', environment_id: 789 },
    trigger: { kind: 'schedule', input: null, connection: { connectionId: 'customer-connection', integrationId: 'github' } },
    async: true
};

async function post(body: unknown): Promise<Response> {
    return await fetch(`http://localhost:${port}/v1/recurring`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });
}

describe('POST /v1/recurring', () => {
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

    it('creates recurring sync schedules', async () => {
        const body = {
            name: 'environment:789:sync:123',
            state: 'STARTED' as const,
            startsAt: new Date().toISOString(),
            frequencyMs: 300_000,
            group: { key: 'sync:environment:789', maxConcurrency: 0 },
            retry: { max: 0 },
            timeoutSettingsInSecs: { createdToStarted: 3600, startedToCompleted: 86_400, heartbeat: 300 },
            args: {
                type: 'sync',
                syncId: '123',
                syncName: 'fetchIssues',
                syncVariant: 'base',
                debug: false,
                connection: {
                    id: 456,
                    connection_id: 'customer-connection',
                    provider_config_key: 'github',
                    environment_id: 789
                }
            }
        };
        const response = await post(body);

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toStrictEqual({ scheduleId });
        expect(recurring).toHaveBeenCalledWith([
            {
                name: body.name,
                state: body.state,
                startsAt: new Date(body.startsAt),
                frequencyMs: body.frequencyMs,
                groupKey: body.group.key,
                retryMax: body.retry.max,
                createdToStartedTimeoutSecs: body.timeoutSettingsInSecs.createdToStarted,
                startedToCompletedTimeoutSecs: body.timeoutSettingsInSecs.startedToCompleted,
                heartbeatTimeoutSecs: body.timeoutSettingsInSecs.heartbeat,
                lastScheduledTaskId: null,
                lastScheduledTaskState: null,
                payload: { ...body.args, emptyCache: false }
            }
        ]);
    });

    it('creates recurring function schedules', async () => {
        const body = {
            name: 'environment:789:function:123',
            state: 'STARTED' as const,
            startsAt: new Date().toISOString(),
            frequencyMs: 300_000,
            group: { key: 'function:environment:789:connection:456:function:fetchIssues', maxConcurrency: 1 },
            retry: { max: 0 },
            timeoutSettingsInSecs: { createdToStarted: 86_400, startedToCompleted: 900, heartbeat: 120 },
            args: functionArgs
        };
        const response = await post(body);

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toStrictEqual({ scheduleId });
        expect(recurring).toHaveBeenCalledWith([
            {
                name: body.name,
                state: body.state,
                startsAt: new Date(body.startsAt),
                frequencyMs: body.frequencyMs,
                groupKey: body.group.key,
                retryMax: body.retry.max,
                createdToStartedTimeoutSecs: body.timeoutSettingsInSecs.createdToStarted,
                startedToCompletedTimeoutSecs: body.timeoutSettingsInSecs.startedToCompleted,
                heartbeatTimeoutSecs: body.timeoutSettingsInSecs.heartbeat,
                lastScheduledTaskId: null,
                lastScheduledTaskState: null,
                payload: body.args
            }
        ]);
    });

    it('creates a batch of recurring schedules and returns their IDs', async () => {
        const scheduleIds = [scheduleId, '01994dc2-b6a7-7e46-964d-5f520e57a083'];
        const body = ['schedule-a', 'schedule-b'].map((name) => ({
            name,
            state: 'STARTED' as const,
            startsAt: '2026-09-15T10:00:00.000Z',
            frequencyMs: 300_000,
            group: { key: 'function:environment:789', maxConcurrency: 0 },
            retry: { max: 0 },
            timeoutSettingsInSecs: { createdToStarted: 86_400, startedToCompleted: 900, heartbeat: 120 },
            args: functionArgs
        }));
        recurring.mockResolvedValueOnce(Ok(scheduleIds.map((id) => ({ id }))));

        const response = await post(body);

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toStrictEqual({ scheduleIds });
        expect(recurring).toHaveBeenCalledTimes(1);
        expect(recurring).toHaveBeenCalledWith(
            body.map((entry) => ({
                name: entry.name,
                state: entry.state,
                startsAt: new Date(entry.startsAt),
                frequencyMs: entry.frequencyMs,
                groupKey: entry.group.key,
                retryMax: entry.retry.max,
                createdToStartedTimeoutSecs: entry.timeoutSettingsInSecs.createdToStarted,
                startedToCompletedTimeoutSecs: entry.timeoutSettingsInSecs.startedToCompleted,
                heartbeatTimeoutSecs: entry.timeoutSettingsInSecs.heartbeat,
                lastScheduledTaskId: null,
                lastScheduledTaskState: null,
                payload: entry.args
            }))
        );
    });

    it('returns a server error when schedule creation fails', async () => {
        const body = {
            name: 'environment:789:function:123',
            state: 'STARTED' as const,
            startsAt: new Date().toISOString(),
            frequencyMs: 300_000,
            group: { key: 'function:environment:789', maxConcurrency: 0 },
            retry: { max: 0 },
            timeoutSettingsInSecs: { createdToStarted: 3600, startedToCompleted: 86_400, heartbeat: 300 },
            args: functionArgs
        };
        recurring.mockResolvedValueOnce(Err(new Error('database unavailable')) as never);

        const response = await post(body);

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toStrictEqual({
            error: { code: 'recurring_failed', message: 'database unavailable' }
        });
    });

    it('rejects unknown function argument fields', async () => {
        const body = {
            name: 'environment:789:function:123',
            state: 'STARTED' as const,
            startsAt: new Date().toISOString(),
            frequencyMs: 300_000,
            group: { key: 'function:environment:789', maxConcurrency: 0 },
            retry: { max: 0 },
            timeoutSettingsInSecs: { createdToStarted: 86_400, startedToCompleted: 900, heartbeat: 120 },
            args: { ...functionArgs, unexpectedId: 123 }
        };

        const response = await post(body);

        expect(response.status).toBe(400);
        expect(recurring).not.toHaveBeenCalled();
    });
});
