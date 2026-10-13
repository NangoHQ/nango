import { describe, expect, it, vi } from 'vitest';

import { Ok } from '@nangohq/utils';

import { UsageTelemetryClient } from './client.js';
import { NoopUsageStore } from './stores/noop.js';

import type { UsageTelemetryWriter } from './store.js';
import type { UsagePoint } from './types.js';

const point: UsagePoint = {
    metric: 'nango.functions.active_concurrency.max',
    ts: new Date('2026-10-09T12:00:00Z'),
    attributes: { environment_id: 1 },
    value: 3
};

function createClient() {
    const store = { record: vi.fn<UsageTelemetryWriter['record']>(() => Promise.resolve(Ok(undefined))) };
    return { store, client: new UsageTelemetryClient(store) };
}

describe('UsageTelemetryClient', () => {
    it('passes points through to the store', async () => {
        const { store, client } = createClient();

        expect((await client.record([point, { ...point, attributes: {} }])).isOk()).toBe(true);
        expect(store.record).toHaveBeenCalledWith([point, { ...point, attributes: {} }]);
    });

    it('never throws: wraps errors with Result', async () => {
        const { store, client } = createClient();
        const error = new Error('boom');
        store.record.mockRejectedValueOnce(error);

        const recorded = await client.record([point]);
        expect(recorded.isErr() && recorded.error).toBe(error);
    });

    it('drops writes when backed by the noop store', async () => {
        const client = new UsageTelemetryClient(new NoopUsageStore());

        expect((await client.record([point])).isOk()).toBe(true);
    });
});
