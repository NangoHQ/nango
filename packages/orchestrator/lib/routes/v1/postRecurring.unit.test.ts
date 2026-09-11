import { EventEmitter } from 'node:events';

import getPort from 'get-port';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemorySlidingWindowRateLimiter } from '@nangohq/kvstore';
import { DuplicateScheduleNameError } from '@nangohq/scheduler';
import { Err, Ok } from '@nangohq/utils';

import { getServer } from '../../server.js';

import type { Scheduler } from '@nangohq/scheduler';
import type { Server } from 'node:http';

const scheduleId = '01994dc2-b6a7-7e46-964d-5f520e57a082';
const recurring = vi.fn(() => Promise.resolve(Ok({ id: scheduleId })));
const scheduler = { recurring } as unknown as Scheduler;
const rateLimiter = new InMemorySlidingWindowRateLimiter({ keyPrefix: 'recurring-route-test', limit: 100, windowMs: 60_000 });
const port = await getPort();
let api: Server;

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
        expect(recurring).toHaveBeenCalledWith({
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
        });
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
            args: {
                type: 'function',
                instanceId: 123
            }
        };
        const response = await post(body);

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toStrictEqual({ scheduleId });
        expect(recurring).toHaveBeenCalledWith({
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
        });
    });

    it('returns a conflict when the schedule already exists', async () => {
        const body = {
            name: 'environment:789:function:123',
            state: 'STARTED' as const,
            startsAt: new Date().toISOString(),
            frequencyMs: 300_000,
            group: { key: 'function:environment:789', maxConcurrency: 0 },
            retry: { max: 0 },
            timeoutSettingsInSecs: { createdToStarted: 3600, startedToCompleted: 86_400, heartbeat: 300 },
            args: { type: 'function', instanceId: 123 }
        };
        recurring.mockResolvedValueOnce(Err(new DuplicateScheduleNameError(body.name)) as never);

        const response = await post(body);

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toStrictEqual({
            error: { code: 'duplicate_schedule_name', message: `Schedule '${body.name}' already exists` }
        });
    });

    it('rejects unexpected recurring function fields', async () => {
        const body = {
            name: 'environment:789:function:123',
            state: 'STARTED' as const,
            startsAt: new Date().toISOString(),
            frequencyMs: 300_000,
            group: { key: 'function:environment:789:connection:456:function:fetchIssues', maxConcurrency: 1 },
            retry: { max: 0 },
            timeoutSettingsInSecs: { createdToStarted: 86_400, startedToCompleted: 900, heartbeat: 120 },
            args: {
                type: 'function',
                instanceId: 123,
                trigger: {
                    kind: 'schedule',
                    input: null,
                    connection: { connectionId: 'customer-connection', integrationId: 'github' }
                }
            }
        };
        const response = await post(body);

        expect(response.status).toBe(400);
        expect(recurring).not.toHaveBeenCalled();
    });
});
