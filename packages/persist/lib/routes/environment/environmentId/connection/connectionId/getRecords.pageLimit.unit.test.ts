import { describe, expect, it } from 'vitest';

import { getRecordsRequestParser } from './validate.js';

/**
 * Persist record reads authenticate with the same environment secret as the
 * public API and forward `limit` to the records store. The parser currently
 * accepts any positive integer, so a caller can request a page large enough
 * to decrypt every document in the process.
 *
 * The ceiling matches the private connection-records route (max 100).
 */
const MAX_PAGE_SIZE = 100;

function acceptedLimit(limit: number): boolean {
    try {
        const parsed = getRecordsRequestParser.parseQuery({ model: 'Account', limit: String(limit) });
        return parsed.limit === limit;
    } catch {
        return false;
    }
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

describe('persist GET records page size', () => {
    it('rejects a page larger than a small cap, including limit 10000', () => {
        const largest = largestAcceptedLimit();
        expect(largest).toBeGreaterThan(0);
        expect(largest).toBeLessThanOrEqual(MAX_PAGE_SIZE);
        expect(acceptedLimit(largest)).toBe(true);
        expect(acceptedLimit(10_000)).toBe(false);
        expect(() => getRecordsRequestParser.parseQuery({ model: 'Account', limit: '10000' })).toThrow();
    });
});
