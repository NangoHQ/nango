import { describe, expect, it } from 'vitest';

import { currencySymbol, MAX_THRESHOLD_IN_CENTS, parseThreshold, thresholdToInput } from './spendAlert.js';

describe('parseThreshold', () => {
    it('parses whole and fractional amounts', () => {
        expect(parseThreshold('50')).toEqual({ ok: true, thresholdInCents: 5000 });
        expect(parseThreshold('49.99')).toEqual({ ok: true, thresholdInCents: 4999 });
        expect(parseThreshold('0.07')).toEqual({ ok: true, thresholdInCents: 7 });
    });

    it('parses a single decimal place as tenths, not hundredths', () => {
        expect(parseThreshold('49.9')).toEqual({ ok: true, thresholdInCents: 4990 });
    });

    it('avoids float error on amounts that lose precision when multiplied', () => {
        expect(parseThreshold('19.99')).toEqual({ ok: true, thresholdInCents: 1999 });
        expect(parseThreshold('1.10')).toEqual({ ok: true, thresholdInCents: 110 });
    });

    it('tolerates pasted formatting', () => {
        expect(parseThreshold('  $1,284.30 ')).toEqual({ ok: true, thresholdInCents: 128430 });
        expect(parseThreshold('10,000,000')).toEqual({ ok: true, thresholdInCents: MAX_THRESHOLD_IN_CENTS });
    });

    it('rejects internal whitespace rather than silently restating the amount', () => {
        expect(parseThreshold('1 2')).toEqual({ ok: false, error: 'Enter an amount like 50 or 49.99' });
        expect(parseThreshold('1 000')).toEqual({ ok: false, error: 'Enter an amount like 50 or 49.99' });
        // Padding around the amount is still fine.
        expect(parseThreshold('  $ 50 ')).toEqual({ ok: true, thresholdInCents: 5000 });
    });

    it('rejects misgrouped separators rather than silently restating the amount', () => {
        // `1,2` stripped of its comma would become 12 — a tenfold threshold from one typo.
        expect(parseThreshold('1,2')).toEqual({ ok: false, error: 'Enter an amount like 50 or 49.99' });
        expect(parseThreshold('1,00')).toEqual({ ok: false, error: 'Enter an amount like 50 or 49.99' });
        expect(parseThreshold('1,2345')).toEqual({ ok: false, error: 'Enter an amount like 50 or 49.99' });
    });

    it('rejects an empty amount', () => {
        expect(parseThreshold('')).toEqual({ ok: false, error: 'Enter an amount' });
        expect(parseThreshold('   ')).toEqual({ ok: false, error: 'Enter an amount' });
    });

    it('rejects a third decimal place rather than rounding it away', () => {
        expect(parseThreshold('49.999')).toEqual({ ok: false, error: 'Enter an amount like 50 or 49.99' });
    });

    it('rejects non-numeric and negative input', () => {
        expect(parseThreshold('fifty')).toEqual({ ok: false, error: 'Enter an amount like 50 or 49.99' });
        expect(parseThreshold('-50')).toEqual({ ok: false, error: 'Enter an amount like 50 or 49.99' });
        expect(parseThreshold('1e5')).toEqual({ ok: false, error: 'Enter an amount like 50 or 49.99' });
    });

    it('rejects zero', () => {
        expect(parseThreshold('0')).toEqual({ ok: false, error: 'Enter an amount greater than 0' });
        expect(parseThreshold('0.00')).toEqual({ ok: false, error: 'Enter an amount greater than 0' });
    });

    it('accepts the ceiling and rejects a slipped decimal point above it', () => {
        expect(parseThreshold('10000000')).toEqual({ ok: true, thresholdInCents: MAX_THRESHOLD_IN_CENTS });
        expect(parseThreshold('10000000.01')).toEqual({ ok: false, error: 'Enter an amount of at most 10,000,000' });
    });
});

describe('thresholdToInput', () => {
    it('drops the decimals on a whole amount', () => {
        expect(thresholdToInput(5000)).toBe('50');
    });

    it('keeps the cents on a fractional amount', () => {
        expect(thresholdToInput(4999)).toBe('49.99');
        expect(thresholdToInput(7)).toBe('0.07');
    });

    it('round-trips through parseThreshold', () => {
        for (const cents of [1, 7, 5000, 4999, 128430, MAX_THRESHOLD_IN_CENTS]) {
            expect(parseThreshold(thresholdToInput(cents))).toEqual({ ok: true, thresholdInCents: cents });
        }
    });
});

describe('currencySymbol', () => {
    it('returns the symbol for a known currency', () => {
        expect(currencySymbol('USD')).toBe('$');
        expect(currencySymbol('eur')).toBe('€');
    });

    it('returns null when there is no currency to show', () => {
        expect(currencySymbol(null)).toBeNull();
        expect(currencySymbol('credits')).toBeNull();
        expect(currencySymbol('')).toBeNull();
    });
});
