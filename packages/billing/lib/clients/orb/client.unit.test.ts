import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrbClient } from './client.js';

/**
 * The Orb SDK is stubbed, so these pin the query we send and which invoices we count —
 * neither of which the endpoint's integration tests can see, since they mock the client itself.
 */
function clientWith(invoices: { due_date: string | null; amount_due: string }[]) {
    const client = new OrbClient();
    // `for await` accepts a sync iterable, so the array stands in for Orb's paginated response.
    const list = vi.fn().mockReturnValue(invoices);
    (client as unknown as { orbSDK: { invoices: { list: typeof list } } }).orbSDK = { invoices: { list } };
    return { client, list };
}

describe('OrbClient.getOverdueInvoices', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-14T15:00:00Z'));
    });

    it('asks Orb only for outstanding invoices due before today', async () => {
        const { client, list } = clientWith([]);

        await client.getOverdueInvoices(42);

        expect(list).toHaveBeenCalledWith({
            external_customer_id: '42',
            status: ['issued', 'synced'],
            // A date, not a timestamp — Orb documents this filter as `format: date`.
            'due_date[lt]': '2026-07-14'
        });
    });

    it('reports overdue when an invoice still owes money', async () => {
        const { client } = clientWith([{ due_date: '2026-07-01T00:00:00Z', amount_due: '42.00' }]);

        expect((await client.getOverdueInvoices(42)).unwrap()).toStrictEqual({ hasOverdue: true });
    });

    it('ignores fully-credited invoices, which Orb still reports as issued', async () => {
        const { client } = clientWith([{ due_date: '2026-07-01T00:00:00Z', amount_due: '0.00' }]);

        expect((await client.getOverdueInvoices(42)).unwrap()).toStrictEqual({ hasOverdue: false });
    });

    it('keeps paging past a credited invoice to find a still-owed one', async () => {
        const { client } = clientWith([
            { due_date: '2026-07-01T00:00:00Z', amount_due: '0.00' },
            { due_date: '2026-07-02T00:00:00Z', amount_due: '10.00' }
        ]);

        expect((await client.getOverdueInvoices(42)).unwrap()).toStrictEqual({ hasOverdue: true });
    });

    it('reports nothing overdue for an empty result', async () => {
        const { client } = clientWith([]);

        expect((await client.getOverdueInvoices(42)).unwrap()).toStrictEqual({ hasOverdue: false });
    });
});
