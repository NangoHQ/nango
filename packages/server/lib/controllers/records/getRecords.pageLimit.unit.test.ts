import { describe, expect, it } from 'vitest';

import { validationQuery } from './getRecords.js';

/**
 * Public record reads must not accept the current 10_000-row page. The handler
 * forwards this parsed limit straight into the records store, which loads each
 * row's document before applying the response byte budget.
 *
 * The ceiling matches the private connection-records route (max 100).
 */
const MAX_PAGE_SIZE = 100;

function acceptedLimit(limit: number): boolean {
    const parsed = validationQuery.safeParse({ model: 'Account', limit: String(limit) });
    return parsed.success && parsed.data.limit === limit;
}

function largestAcceptedLimit(): number {
    if (!acceptedLimit(1)) {
        return 0;
    }
    let lo = 1;
    let hi = 1;
    while (acceptedLimit(hi) && hi < 1_000_000_000) {
        lo = hi;
        hi = Math.min(hi * 10, 1_000_000_000);
    }
    if (acceptedLimit(hi)) {
        return hi;
    }
    while (lo + 1 < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (acceptedLimit(mid)) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return lo;
}

describe('GET /records page size', () => {
    it('rejects a page larger than a small cap, including limit 10000', () => {
        const largest = largestAcceptedLimit();
        expect(largest).toBeGreaterThan(0);
        expect(largest).toBeLessThanOrEqual(MAX_PAGE_SIZE);
        expect(acceptedLimit(largest)).toBe(true);
        expect(acceptedLimit(10_000)).toBe(false);
        expect(validationQuery.safeParse({ model: 'Account', limit: '10000' }).success).toBe(false);
    });
});
