import { describe, expect, it } from 'vitest';

import { buildUsageRowCharges } from './usageCharges';

import type { GetBillingPeriodCosts } from '@nangohq/types';

function success(data: GetBillingPeriodCosts['Success']['data']): GetBillingPeriodCosts['Success'] {
    return { data };
}

const settled = { enabled: true, isPending: false, isError: false };

describe('buildUsageRowCharges', () => {
    it('returns null when charges do not apply, so the column can be dropped', () => {
        expect(buildUsageRowCharges({ ...settled, enabled: false, data: undefined })).toBeNull();
    });

    it('formats a charge in the response currency', () => {
        const charges = buildUsageRowCharges({ ...settled, data: success({ metrics: { records: 2317 }, unattributedInCents: 0, currency: 'USD' }) });

        expect(charges?.('records')).toEqual({ formatted: '$23.17', pending: false });
    });

    it('states a real zero as zero rather than as no figure', () => {
        const charges = buildUsageRowCharges({ ...settled, data: success({ metrics: { records: 0 }, unattributedInCents: 0, currency: 'USD' }) });

        expect(charges?.('records')).toEqual({ formatted: '$0.00', pending: false });
    });

    it('reads a metric with no price as zero when everything was attributed', () => {
        // Real state: some accounts have had a metric's price removed by hand, so they owe nothing on it.
        const charges = buildUsageRowCharges({ ...settled, data: success({ metrics: { proxy: 100 }, unattributedInCents: 0, currency: 'USD' }) });

        expect(charges?.('records')).toEqual({ formatted: '$0.00', pending: false });
    });

    it('refuses to call an unpriced metric zero while a charge went unattributed', () => {
        const charges = buildUsageRowCharges({ ...settled, data: success({ metrics: { proxy: 100 }, unattributedInCents: 750, currency: 'USD' }) });

        expect(charges?.('records').formatted).toBeNull();
        // The charges it did attribute are still trustworthy.
        expect(charges?.('proxy').formatted).toBe('$1.00');
    });

    it('states no figure for a currency it cannot format', () => {
        const charges = buildUsageRowCharges({ ...settled, data: success({ metrics: { records: 100 }, unattributedInCents: 0, currency: 'credits' }) });

        expect(charges?.('records').formatted).toBeNull();
    });

    it('reports pending while the query is in flight', () => {
        const charges = buildUsageRowCharges({ enabled: true, isPending: true, isError: false, data: undefined });

        expect(charges?.('records')).toEqual({ formatted: null, pending: true });
    });

    it('drops a stale figure when the refetch failed', () => {
        const charges = buildUsageRowCharges({
            enabled: true,
            isPending: false,
            isError: true,
            data: success({ metrics: { records: 2317 }, unattributedInCents: 0, currency: 'USD' })
        });

        expect(charges?.('records')).toEqual({ formatted: null, pending: false });
    });
});
