import { describe, expect, it } from 'vitest';

import { createHostedTelemetry } from './telemetry.js';

import type { Knex } from 'knex';

describe('hosted telemetry shutdown', () => {
    it('stops waiting on a store that never answers once the timeout passes', async () => {
        const hanging = { transaction: () => new Promise(() => {}) } as unknown as Knex;
        const telemetry = createHostedTelemetry({ knex: hanging, exportIntervalMs: 3_600_000 });
        telemetry.histogram('nango.hosted_metric.active_concurrency', 3, { environment_id: 7 });

        const startedAt = performance.now();
        await expect(telemetry.shutdown({ timeoutMs: 50 })).resolves.toBeUndefined();
        expect(performance.now() - startedAt).toBeLessThan(1_000);
    });
});
