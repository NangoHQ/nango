import { describe, expect, it } from 'vitest';

import { buildProjectedCharges, buildUsageRowCharges } from './usageCharges';

import type { GetBillingPeriodCosts, GetProjectedCosts } from '@nangohq/types';

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
            data: success({ metrics: { records: 2317 }, malformedMetrics: [], fullyAttributed: true, fixedInCents: 0, currency: 'USD', noCosts: false })
        });

        expect(charges?.('records')).toEqual({ formatted: '$23.17', pending: false });
    });

    it('states a real zero as zero rather than as no figure', () => {
        const charges = buildUsageRowCharges({
            ...settled,
            data: success({ metrics: { records: 0 }, malformedMetrics: [], fullyAttributed: true, fixedInCents: 0, currency: 'USD', noCosts: false })
        });

        expect(charges?.('records')).toEqual({ formatted: '$0.00', pending: false });
    });

    it('reads a metric with no price as zero when everything was attributed', () => {
        // Real state: some accounts have had a metric's price removed by hand, so they owe nothing on it.
        const charges = buildUsageRowCharges({
            ...settled,
            data: success({ metrics: { proxy: 100 }, malformedMetrics: [], fullyAttributed: true, fixedInCents: 0, currency: 'USD', noCosts: false })
        });

        expect(charges?.('records')).toEqual({ formatted: '$0.00', pending: false });
    });

    it('refuses to call an unpriced metric zero while another charge went unattributed', () => {
        const charges = buildUsageRowCharges({
            ...settled,
            data: success({ metrics: { proxy: 100 }, malformedMetrics: [], fullyAttributed: false, fixedInCents: 0, currency: 'USD', noCosts: false })
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
                fixedInCents: 0,
                currency: 'USD',
                noCosts: false
            })
        });

        expect(charges?.('records').formatted).toBeNull();
        expect(charges?.('proxy').formatted).toBe('$1.00');
    });

    it('states an unpriced metric as a dash when asked, so it is not read as a comparable $0.00', () => {
        const costs = { metrics: { records: 100 }, malformedMetrics: [], fullyAttributed: true, fixedInCents: 0, currency: 'USD', noCosts: false };

        expect(buildUsageRowCharges({ ...settled, data: success(costs) })?.('data_transfer').formatted).toBe('$0.00');
        expect(buildUsageRowCharges({ ...settled, data: success(costs), unpriced: 'dash' })?.('data_transfer').formatted).toBeNull();
        expect(buildUsageRowCharges({ ...settled, data: success(costs), unpriced: 'dash' })?.('records').formatted).toBe('$1.00');
    });

    it('states no figure for a currency it cannot format', () => {
        const charges = buildUsageRowCharges({
            ...settled,
            data: success({ metrics: { records: 100 }, malformedMetrics: [], fullyAttributed: true, fixedInCents: 0, currency: 'credits', noCosts: false })
        });

        expect(charges?.('records').formatted).toBeNull();
    });

    it('states no figure when the server reports no billing period to cost', () => {
        const charges = buildUsageRowCharges({
            ...settled,
            data: success({ metrics: {}, malformedMetrics: [], fullyAttributed: true, fixedInCents: 0, currency: null, noCosts: true })
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
            data: success({ metrics: { records: 2317 }, malformedMetrics: [], fullyAttributed: true, fixedInCents: 0, currency: 'USD', noCosts: false })
        });

        expect(charges?.('records')).toEqual({ formatted: null, pending: false });
    });
});

function projection({
    metrics = {},
    notApplicable = false
}: { metrics?: GetProjectedCosts['Success']['data']['metrics']; notApplicable?: boolean } = {}): GetProjectedCosts['Success'] {
    return {
        data: {
            metrics,
            subtotalInCents: 0,
            minimumInCents: 5000,
            minimumApplied: false,
            growthAddOnInCents: 0,
            totalInCents: 0,
            periodComplete: true,
            currency: 'USD',
            notApplicable
        }
    };
}

describe('buildProjectedCharges', () => {
    it('returns null when there is no migration to project', () => {
        expect(buildProjectedCharges({ ...settled, enabled: false, data: undefined })).toBeNull();
        expect(buildProjectedCharges({ ...settled, data: projection({ notApplicable: true }) })).toBeNull();
    });

    it('formats each projected charge in the response currency', () => {
        const charges = buildProjectedCharges({
            ...settled,
            data: projection({ metrics: { connections: 986, function_duration_seconds: 4630, data_transfer: 620 } })
        });

        expect(charges?.('connections')).toEqual({ formatted: '$9.86', pending: false });
        expect(charges?.('function_duration_seconds')).toEqual({ formatted: '$46.30', pending: false });
        expect(charges?.('data_transfer')).toEqual({ formatted: '$6.20', pending: false });
    });

    it('reads an absent metric as a real zero', () => {
        const charges = buildProjectedCharges({ ...settled, data: projection({ metrics: {} }) });

        expect(charges?.('connections')).toEqual({ formatted: '$0.00', pending: false });
    });

    it('shows a skeleton while loading rather than a stale figure', () => {
        const charges = buildProjectedCharges({ ...settled, isPending: true, data: undefined });

        expect(charges?.('connections')).toEqual({ formatted: null, pending: true });
    });

    it('states no figure on error, since react-query keeps the last success', () => {
        const charges = buildProjectedCharges({ ...settled, isError: true, data: projection({ metrics: { connections: 986 } }) });

        expect(charges?.('connections')).toEqual({ formatted: null, pending: false });
    });
});
