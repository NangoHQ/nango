import { beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { recordFunctionExecution } from './metrics.js';

describe('recordFunctionExecution', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('emits the duration under the tags dashboards query', () => {
        const duration = vi.spyOn(metrics, 'duration').mockImplementation(() => undefined);

        recordFunctionExecution({ accountId: 42, type: 'sync', success: false, durationMs: 1234, runtime: 'lambda' });

        expect(duration).toHaveBeenCalledWith('nango.jobs.function.duration_ms', 1234, {
            accountId: 42,
            type: 'sync',
            success: 'false',
            functionRuntime: 'lambda'
        });
    });

    it('omits the runtime tag when unknown', () => {
        const duration = vi.spyOn(metrics, 'duration').mockImplementation(() => undefined);

        recordFunctionExecution({ accountId: 7, type: 'action', success: true, durationMs: 0, runtime: undefined });

        expect(duration).toHaveBeenCalledWith('nango.jobs.function.duration_ms', 0, {
            accountId: 7,
            type: 'action',
            success: 'true'
        });
    });
});
