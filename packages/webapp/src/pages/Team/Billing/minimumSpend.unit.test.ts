import { describe, expect, it } from 'vitest';

import { buildMinimumSpendRow } from './minimumSpend.js';

describe('buildMinimumSpendRow', () => {
    // 74c of usage under a $50 minimum, from a live pay-as-you-go invoice.
    const binding = { enforcedInCents: 4999, topUpInCents: 4925 };

    it('states what the minimum adds, not the minimum itself', () => {
        // The charges above already carry the usage, so the enforced figure would double-count it.
        expect(buildMinimumSpendRow({ enabled: true, minimum: binding, currency: 'USD' })?.formatted).toBe('$49.25');
    });

    it('names the enforced minimum in the tooltip', () => {
        expect(buildMinimumSpendRow({ enabled: true, minimum: { enforcedInCents: 4833, topUpInCents: 4637 }, currency: 'USD' })?.tooltip).toContain(
            '$48.33 minimum'
        );
    });

    it('states nothing when no minimum binds', () => {
        expect(buildMinimumSpendRow({ enabled: true, minimum: null, currency: 'USD' })).toBeNull();
    });

    it('states nothing on a plan that sells no minimum', () => {
        expect(buildMinimumSpendRow({ enabled: false, minimum: binding, currency: 'USD' })).toBeNull();
    });

    it('states nothing rather than a bare number when the currency cannot be formatted', () => {
        expect(buildMinimumSpendRow({ enabled: true, minimum: binding, currency: 'credits' })).toBeNull();
        expect(buildMinimumSpendRow({ enabled: true, minimum: binding, currency: null })).toBeNull();
    });
});
