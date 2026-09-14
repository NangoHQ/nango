import { describe, expect, it } from 'vitest';

import { EARLIEST_USAGE_MONTH_MS } from './usageBreakdown.js';
import { usageMonthFloorMs, usageMonthFloorReason } from './usageMonthFloor.js';

describe('usageMonthFloorMs', () => {
    it('floors at the account creation month when the account is newer than the data start', () => {
        expect(usageMonthFloorMs('2026-08-20T14:00:00Z')).toBe(Date.UTC(2026, 7, 1));
    });

    it('keeps the creation month reachable for an account created mid-month', () => {
        expect(usageMonthFloorMs('2026-08-31T23:59:59Z')).toBe(Date.UTC(2026, 7, 1));
    });

    it('floors at the data start when the account predates it', () => {
        expect(usageMonthFloorMs('2024-01-15T00:00:00Z')).toBe(EARLIEST_USAGE_MONTH_MS);
    });

    it('uses the UTC month, not the local one', () => {
        // Near midnight UTC on purpose: west of Greenwich this is still August 31st, so a local-time floor would slip.
        expect(usageMonthFloorMs('2026-09-01T00:30:00Z')).toBe(Date.UTC(2026, 8, 1));
    });

    it('falls back to the data start when the creation date is missing or unparseable', () => {
        expect(usageMonthFloorMs(undefined)).toBe(EARLIEST_USAGE_MONTH_MS);
        expect(usageMonthFloorMs('not a date')).toBe(EARLIEST_USAGE_MONTH_MS);
    });
});

describe('usageMonthFloorReason', () => {
    it('reports the bound that produced the floor', () => {
        expect(usageMonthFloorReason(Date.UTC(2026, 7, 1))).toBe('account-created');
        expect(usageMonthFloorReason(EARLIEST_USAGE_MONTH_MS)).toBe('data-start');
    });
});
