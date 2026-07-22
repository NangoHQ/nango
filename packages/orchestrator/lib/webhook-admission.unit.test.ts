import { describe, expect, it, vi } from 'vitest';

import { Err, metrics, Ok } from '@nangohq/utils';

import { WebhookAdmissionController } from './webhook-admission.js';

import type { Scheduler } from '@nangohq/scheduler';

function createController({ createdCount = 0, maxConcurrency = 2, createdCountMax = 10 } = {}) {
    const getCreatedCount = vi.fn().mockResolvedValue(Ok(createdCount));
    const scheduler = {
        monitoring: { createdCountForGroupPrefix: getCreatedCount }
    } as unknown as Scheduler;
    const controller = new WebhookAdmissionController({
        scheduler,
        maxConcurrency,
        createdCountMax,
        refreshIntervalMs: 60_000,
        retryAfterMs: 1500
    });
    return { controller, getCreatedCount };
}

describe('WebhookAdmissionController', () => {
    it('limits concurrent webhook admissions', async () => {
        const { controller } = createController({ maxConcurrency: 1 });
        await controller.start();

        const first = controller.acquire(1);
        expect(first.acquired).toBe(true);
        expect(controller.acquire(1)).toEqual({ acquired: false, reason: 'concurrency', retryAfterMs: 1500 });

        if (first.acquired) {
            first.release(1);
        }
        expect(controller.acquire(1).acquired).toBe(true);
        await controller.stop();
    });

    it('reserves space against the global webhook backlog watermark', async () => {
        const { controller } = createController({ createdCount: 8, createdCountMax: 10 });
        await controller.start();

        expect(controller.acquire(2).acquired).toBe(true);
        expect(controller.acquire(1)).toEqual({ acquired: false, reason: 'backlog', retryAfterMs: 1500 });
        await controller.stop();
    });

    it('fails startup when the scheduler backlog cannot be read', async () => {
        const { controller, getCreatedCount } = createController();
        getCreatedCount.mockResolvedValueOnce(Err(new Error('database unavailable')));

        await expect(controller.start()).rejects.toThrow('database unavailable');
        expect(controller.acquire(1)).toEqual({ acquired: false, reason: 'backlog_unavailable', retryAfterMs: 1500 });
    });

    it('records admission decisions and backlog state', async () => {
        const increment = vi.spyOn(metrics, 'increment').mockImplementation(() => {});
        const gauge = vi.spyOn(metrics, 'gauge').mockImplementation(() => {});
        const { controller } = createController({ createdCount: 9, createdCountMax: 10 });
        await controller.start();

        const permit = controller.acquire(1);
        expect(controller.acquire(1)).toEqual({ acquired: false, reason: 'backlog', retryAfterMs: 1500 });
        if (permit.acquired) {
            permit.release(1);
        }

        expect(increment).toHaveBeenCalledWith(metrics.Types.ORCH_WEBHOOK_ADMISSION, 1, { result: 'accepted' });
        expect(increment).toHaveBeenCalledWith(metrics.Types.ORCH_WEBHOOK_ADMISSION, 1, { result: 'rejected', reason: 'backlog' });
        expect(gauge).toHaveBeenCalledWith(metrics.Types.ORCH_WEBHOOK_BACKLOG, 9);
        expect(gauge).toHaveBeenCalledWith(metrics.Types.ORCH_WEBHOOK_ADMISSION_INFLIGHT, 1);
        expect(gauge).toHaveBeenCalledWith(metrics.Types.ORCH_WEBHOOK_ADMISSION_INFLIGHT, 0);
        await controller.stop();
    });
});
