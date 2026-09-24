import { describe, expect, it } from 'vitest';

import { formatBillingDate, nextUsageResetDate } from './billingPeriod.js';

describe('nextUsageResetDate', () => {
    it('returns the 1st of the next month', () => {
        expect(nextUsageResetDate(new Date('2026-08-12T15:00:00Z')).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });

    it('handles the last day of the month', () => {
        expect(nextUsageResetDate(new Date('2026-08-31T23:59:59Z')).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });

    it('rolls over the year in December', () => {
        expect(nextUsageResetDate(new Date('2026-12-25T10:00:00Z')).toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });

    it('uses the UTC month, not the local one', () => {
        // 01:30 on Sep 1st in UTC+2 is still August 31st in UTC, so the reset is Sep 1st — not Oct 1st.
        expect(nextUsageResetDate(new Date('2026-08-31T23:30:00Z')).toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });
});

describe('formatBillingDate', () => {
    it('formats as month day, year', () => {
        expect(formatBillingDate(new Date('2026-09-14T00:00:00Z'))).toBe('September 14, 2026');
    });

    it('formats in UTC regardless of the local timezone', () => {
        // Midnight UTC is the previous evening west of Greenwich; the date must not shift back a day.
        expect(formatBillingDate(new Date('2027-01-01T00:00:00Z'))).toBe('January 1, 2027');
    });
});
