import { describe, expect, it } from 'vitest';

import { filterPositiveConnectionSlices } from './usage.js';

import type { RecordCount } from '@nangohq/records';

// Locks in the "preserve HTTP-path semantics" decision: a connection is either
// emitted with its full model-level granularity, or dropped entirely. Mixed-sign
// slices that net positive must be kept whole; mixed-sign that net non-positive
// must be dropped whole. Per-slice filtering would over-count mixed-sign
// connections vs the HTTP path that's been in prod since day one.

function slice(connection_id: number, model: string, count: number): RecordCount {
    return {
        model,
        connection_id,
        environment_id: 1,
        count,
        size_bytes: 0,
        updated_at: '',
        autodelete_checked_at: null
    };
}

describe('filterPositiveConnectionSlices', () => {
    it('drops a connection whose slices are all negative', () => {
        const slices = [slice(1, 'Account', -3), slice(1, 'Contact', -7)];
        expect(filterPositiveConnectionSlices(slices)).toEqual([]);
    });

    it('keeps a connection whose slices are all positive (preserves model granularity)', () => {
        const slices = [slice(1, 'Account', 4), slice(1, 'Contact', 6)];
        expect(filterPositiveConnectionSlices(slices)).toEqual(slices);
    });

    it('keeps a mixed-sign connection whose net sum is positive (preserves negative slice)', () => {
        // (-3, +10) sums to +7. HTTP would emit a `records` event with count=7, so the
        // CH side has to retain BOTH slices — the dashboard recomputes the net via
        // SUM(value), which only matches HTTP if the -3 row is still present.
        const slices = [slice(1, 'Account', -3), slice(1, 'Contact', 10)];
        expect(filterPositiveConnectionSlices(slices)).toEqual(slices);
    });

    it('drops a mixed-sign connection whose net sum is non-positive (drops both slices)', () => {
        const slices = [slice(1, 'Account', -10), slice(1, 'Contact', 3)];
        expect(filterPositiveConnectionSlices(slices)).toEqual([]);
    });

    it('drops a connection whose net sum is exactly zero', () => {
        const slices = [slice(1, 'Account', -5), slice(1, 'Contact', 5)];
        expect(filterPositiveConnectionSlices(slices)).toEqual([]);
    });

    it('handles multiple connections independently', () => {
        const positive = [slice(1, 'Account', 4)];
        const negative = [slice(2, 'Account', -8), slice(2, 'Contact', 3)];
        const mixedPositive = [slice(3, 'Account', -1), slice(3, 'Contact', 5)];
        const result = filterPositiveConnectionSlices([...positive, ...negative, ...mixedPositive]);
        expect(result).toEqual([...positive, ...mixedPositive]);
    });

    it('returns an empty array when given no input', () => {
        expect(filterPositiveConnectionSlices([])).toEqual([]);
    });
});
