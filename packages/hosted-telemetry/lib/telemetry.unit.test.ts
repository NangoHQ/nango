import { describe, expect, it, vi } from 'vitest';

import { createHostedTelemetry } from './telemetry.js';

import type * as NangoUtils from '@nangohq/utils';
import type { Knex } from 'knex';

const logger = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock('@nangohq/utils', async () => {
    const actual: typeof NangoUtils = await vi.importActual('@nangohq/utils');
    return { ...actual, getLogger: () => logger };
});

describe('hosted telemetry shutdown', () => {
    it('stops waiting on a store that never answers once the timeout passes, and says the window may be lost', async () => {
        const hanging = { transaction: () => new Promise(() => {}) } as unknown as Knex;
        const telemetry = createHostedTelemetry({ knex: hanging, exportIntervalMs: 3_600_000 });
        telemetry.histogram('nango.hosted_metric.active_concurrency', 3);

        const startedAt = performance.now();
        await expect(telemetry.shutdown({ timeoutMs: 50 })).resolves.toBeUndefined();
        expect(performance.now() - startedAt).toBeLessThan(1_000);
        expect(logger.warning).toHaveBeenCalledWith('Shutdown stopped waiting after 50ms, the last window may not have been written');
    });

    it('does not warn when the export finishes in time', async () => {
        logger.warning.mockClear();
        const raw = vi.fn(() => Promise.resolve());
        const answering = { transaction: (write: (trx: unknown) => Promise<void>) => write({ raw }) } as unknown as Knex;
        const telemetry = createHostedTelemetry({ knex: answering, exportIntervalMs: 3_600_000 });
        telemetry.histogram('nango.hosted_metric.active_concurrency', 3);

        await expect(telemetry.shutdown({ timeoutMs: 1_000 })).resolves.toBeUndefined();
        expect(raw).toHaveBeenCalled();
        expect(logger.warning).not.toHaveBeenCalled();
    });
});
