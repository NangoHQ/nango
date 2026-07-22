import { afterEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { WebhookAdmissionController } from './webhook-admission.js';

function createController({ maxConcurrency = 2 } = {}) {
    const controller = new WebhookAdmissionController({
        maxConcurrency,
        retryAfterMs: 1500
    });
    return controller;
}

describe('WebhookAdmissionController', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('limits concurrent webhook admissions', () => {
        const controller = createController({ maxConcurrency: 1 });

        const first = controller.acquire();
        expect(first.acquired).toBe(true);
        expect(controller.acquire()).toEqual({ acquired: false, reason: 'concurrency', retryAfterMs: 1500 });

        if (first.acquired) {
            first.release();
        }
        expect(controller.acquire().acquired).toBe(true);
    });

    it('records admission decisions and in-flight state', () => {
        const increment = vi.spyOn(metrics, 'increment').mockImplementation(() => {});
        const gauge = vi.spyOn(metrics, 'gauge').mockImplementation(() => {});
        const controller = createController({ maxConcurrency: 1 });

        const permit = controller.acquire();
        expect(controller.acquire()).toEqual({ acquired: false, reason: 'concurrency', retryAfterMs: 1500 });
        if (permit.acquired) {
            permit.release();
        }

        expect(increment).toHaveBeenCalledWith(metrics.Types.ORCH_WEBHOOK_ADMISSION, 1, { result: 'accepted' });
        expect(increment).toHaveBeenCalledWith(metrics.Types.ORCH_WEBHOOK_ADMISSION, 1, { result: 'rejected', reason: 'concurrency' });
        expect(gauge).toHaveBeenCalledWith(metrics.Types.ORCH_WEBHOOK_ADMISSION_INFLIGHT, 1);
        expect(gauge).toHaveBeenCalledWith(metrics.Types.ORCH_WEBHOOK_ADMISSION_INFLIGHT, 0);
    });
});
