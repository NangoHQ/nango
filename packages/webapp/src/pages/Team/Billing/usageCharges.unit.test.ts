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
        const charges = buildUsageRowCharges({
            ...settled,
            data: success({ metrics: { records: 2317 }, malformedMetrics: [], fullyAttributed: true, currency: 'USD', noCosts: false })
        });

        expect(charges?.('records')).toEqual({ formatted: '$23.17', pending: false });
    });

    it('states a real zero as zero rather than as no figure', () => {
        const charges = buildUsageRowCharges({
            ...settled,
            data: success({ metrics: { records: 0 }, malformedMetrics: [], fullyAttributed: true, currency: 'USD', noCosts: false })
        });

        expect(charges?.('records')).toEqual({ formatted: '$0.00', pending: false });
    });

    it('reads a metric with no price as zero when everything was attributed', () => {
        // Real state: some accounts have had a metric's price removed by hand, so they owe nothing on it.
        const charges = buildUsageRowCharges({
            ...settled,
            data: success({ metrics: { proxy: 100 }, malformedMetrics: [], fullyAttributed: true, currency: 'USD', noCosts: false })
        });

        expect(charges?.('records')).toEqual({ formatted: '$0.00', pending: false });
    });

    it('refuses to call an unpriced metric zero while another charge went unattributed', () => {
        const charges = buildUsageRowCharges({
            ...settled,
            data: success({ metrics: { proxy: 100 }, malformedMetrics: [], fullyAttributed: false, currency: 'USD', noCosts: false })
        });

        expect(charges?.('records').formatted).toBeNull();
        // The charges it did attribute are still trustworthy.
        expect(charges?.('proxy').formatted).toBe('$1.00');
    });

    it('shows a dash for a metric whose own price came through malformed, not $0', () => {
        // Its own price is known bad, but that says nothing about any other metric.
        const charges = buildUsageRowCharges({
            ...settled,
            data: success({
                metrics: { proxy: 100 },
                malformedMetrics: ['records'],
                fullyAttributed: true,
                currency: 'USD',
                noCosts: false
            })
        });

        expect(charges?.('records').formatted).toBeNull();
        expect(charges?.('proxy').formatted).toBe('$1.00');
    });

    it('states no figure for a currency it cannot format', () => {
        const charges = buildUsageRowCharges({
            ...settled,
            data: success({ metrics: { records: 100 }, malformedMetrics: [], fullyAttributed: true, currency: 'credits', noCosts: false })
        });

        expect(charges?.('records').formatted).toBeNull();
    });

    it('states no figure when the server reports no billing period to cost', () => {
        const charges = buildUsageRowCharges({
            ...settled,
            data: success({ metrics: {}, malformedMetrics: [], fullyAttributed: true, currency: null, noCosts: true })
        });

        expect(charges?.('records')).toEqual({ formatted: null, pending: false });
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
            data: success({ metrics: { records: 2317 }, malformedMetrics: [], fullyAttributed: true, currency: 'USD', noCosts: false })
        });

        expect(charges?.('records')).toEqual({ formatted: null, pending: false });
    });
});
