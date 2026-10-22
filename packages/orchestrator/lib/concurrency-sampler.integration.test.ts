import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hostedTelemetry } from '@nangohq/hosted-telemetry';
import { getTestDbClient, Scheduler } from '@nangohq/scheduler';
import { Err, metrics, nanoid } from '@nangohq/utils';

import { ConcurrencySampler } from './concurrency-sampler.js';

import type { Task } from '@nangohq/scheduler';
import type * as NangoUtils from '@nangohq/utils';

// isCloud is a module-level constant computed from process.env at import time, so it is swapped through a getter
const deployment = vi.hoisted(() => ({ isCloud: true }));
vi.mock('@nangohq/utils', async () => {
    const actual: typeof NangoUtils = await vi.importActual('@nangohq/utils');
    return {
        ...actual,
        get isCloud() {
            return deployment.isCloud;
        }
    };
});

describe('ConcurrencySampler', () => {
    const dbClient = getTestDbClient('orchestrator_concurrency_sampler');
    let scheduler: Scheduler;

    beforeEach(async () => {
        await dbClient.migrate();
        scheduler = new Scheduler({
            db: dbClient.db,
            on: {
                CREATED: () => {},
                STARTED: () => {},
                SUCCEEDED: () => {},
                FAILED: () => {},
                EXPIRED: () => {},
                CANCELLED: () => {}
            },
            onError: () => {}
        });
    });

    afterEach(async () => {
        deployment.isCloud = true;
        vi.restoreAllMocks();
        await scheduler.stop();
        await dbClient.clearDatabase();
    });

    afterAll(async () => {
        await dbClient.destroy();
    });

    it('should emit ORCH_CONCURRENCY_ACTIVE for each environment with started tasks', async () => {
        const env1 = randomEnvironmentId();
        for (let i = 0; i < 3; i++) {
            await immediate(scheduler, { groupKey: `sync:environment:${env1}` });
        }
        await immediate(scheduler, { groupKey: `action:environment:${env1}` });

        const env2 = env1 + 1;
        await immediate(scheduler, { groupKey: `webhook:environment:${env2}` });

        // no `environment:<id>` segment, so it is left out
        await immediate(scheduler, { groupKey: 'no-environment' });

        (await scheduler.dequeue({ groupKeyPattern: `sync:environment:${env1}`, limit: 2 })).unwrap();
        (await scheduler.dequeue({ groupKeyPattern: `action:environment:${env1}`, limit: 1 })).unwrap();
        (await scheduler.dequeue({ groupKeyPattern: `webhook:environment:${env2}`, limit: 1 })).unwrap();
        (await scheduler.dequeue({ groupKeyPattern: 'no-environment', limit: 1 })).unwrap();

        const distribution = vi.spyOn(metrics, 'distribution').mockImplementation(() => {});
        const duration = vi.spyOn(metrics, 'duration').mockImplementation(() => {});

        const sampler = new ConcurrencySampler({ scheduler, tickIntervalMs: 1000, queryTimeoutMs: 1000, onError: () => {} });
        await sampler.run();

        const calls = distribution.mock.calls.filter((call) => call[0] === metrics.Types.ORCH_CONCURRENCY_ACTIVE);
        expect(calls.sort((a, b) => Number(a[2]?.['environmentId']) - Number(b[2]?.['environmentId']))).toEqual([
            [metrics.Types.ORCH_CONCURRENCY_ACTIVE, 3, { environmentId: env1 }],
            [metrics.Types.ORCH_CONCURRENCY_ACTIVE, 1, { environmentId: env2 }]
        ]);
        expect(duration).toHaveBeenCalledWith(metrics.Types.ORCH_CONCURRENCY_SAMPLING_DURATION_MS, expect.any(Number), { success: 'true' });
    });

    it('should record to hosted telemetry outside cloud', async () => {
        deployment.isCloud = false;
        const env1 = randomEnvironmentId();
        for (let i = 0; i < 2; i++) {
            await immediate(scheduler, { groupKey: `sync:environment:${env1}` });
        }
        (await scheduler.dequeue({ groupKeyPattern: `sync:environment:${env1}`, limit: 2 })).unwrap();

        const distribution = vi.spyOn(metrics, 'distribution').mockImplementation(() => {});
        const histogram = vi.spyOn(hostedTelemetry, 'histogram').mockImplementation(() => {});

        const sampler = new ConcurrencySampler({ scheduler, tickIntervalMs: 1000, queryTimeoutMs: 1000, onError: () => {} });
        await sampler.run();

        expect(histogram).toHaveBeenCalledWith('nango.hosted_metric.active_concurrency', 2, { environment_id: env1 });
        expect(distribution).not.toHaveBeenCalled();
    });

    it('should not emit samples when the count fails', async () => {
        vi.spyOn(scheduler.monitoring, 'concurrencyPerGroup').mockResolvedValue(Err(new Error('statement timeout')));
        const distribution = vi.spyOn(metrics, 'distribution').mockImplementation(() => {});
        const duration = vi.spyOn(metrics, 'duration').mockImplementation(() => {});

        const sampler = new ConcurrencySampler({ scheduler, tickIntervalMs: 1000, queryTimeoutMs: 1000, onError: () => {} });
        await sampler.run();

        expect(distribution).not.toHaveBeenCalled();
        expect(duration).toHaveBeenCalledWith(metrics.Types.ORCH_CONCURRENCY_SAMPLING_DURATION_MS, expect.any(Number), { success: 'false' });
    });
});

function randomEnvironmentId(): number {
    return 1_000_000 + Math.floor(Math.random() * 1_000_000_000);
}

async function immediate(scheduler: Scheduler, props: { groupKey: string }): Promise<Task> {
    return (
        await scheduler.immediate({
            name: nanoid(),
            payload: {},
            groupKey: props.groupKey,
            groupMaxConcurrency: 0,
            retryMax: 0,
            retryCount: 0,
            createdToStartedTimeoutSecs: 3600,
            startedToCompletedTimeoutSecs: 3600,
            heartbeatTimeoutSecs: 600,
            ownerKey: null,
            retryKey: null
        })
    ).unwrap();
}
