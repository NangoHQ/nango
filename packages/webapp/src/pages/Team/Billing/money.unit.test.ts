import { describe, expect, it } from 'vitest';

import { formatMoneyFromCents } from './money.js';

describe('formatMoneyFromCents', () => {
    it('formats whole and fractional dollar amounts', () => {
        expect(formatMoneyFromCents(0, 'USD')).toBe('$0.00');
        expect(formatMoneyFromCents(7, 'USD')).toBe('$0.07');
        expect(formatMoneyFromCents(14900, 'USD')).toBe('$149.00');
    });

    it('groups thousands', () => {
        expect(formatMoneyFromCents(128430, 'USD')).toBe('$1,284.30');
        expect(formatMoneyFromCents(123456789, 'USD')).toBe('$1,234,567.89');
    });

    it('normalises the currency code', () => {
        expect(formatMoneyFromCents(128430, 'usd')).toBe('$1,284.30');
        expect(formatMoneyFromCents(128430, ' USD ')).toBe('$1,284.30');
    });

    it('renders non-USD currencies in their own symbol', () => {
        expect(formatMoneyFromCents(128430, 'EUR')).toBe('€1,284.30');
    });

    it("uses each currency's own precision rather than forcing cents", () => {
        // JPY has no minor unit.
        expect(formatMoneyFromCents(128400, 'JPY')).toBe('¥1,284');
    });

    it('returns null for a currency with no dollar meaning', () => {
        expect(formatMoneyFromCents(1000, 'credits')).toBeNull();
        expect(formatMoneyFromCents(1000, null)).toBeNull();
        expect(formatMoneyFromCents(1000, '')).toBeNull();
    });

    it('returns null for a non-finite amount', () => {
        expect(formatMoneyFromCents(NaN, 'USD')).toBeNull();
        expect(formatMoneyFromCents(Infinity, 'USD')).toBeNull();
    });
});
