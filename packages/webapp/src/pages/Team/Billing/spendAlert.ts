/** $10,000,000. Mirrors the ceiling in the server's putSpendAlert validator. */
export const MAX_THRESHOLD_IN_CENTS = 1_000_000_000;

export type ParsedThreshold = { ok: true; thresholdInCents: number } | { ok: false; error: string };

/**
 * Parsed off the digits, not `Number(x) * 100`, which is lossy (`19.99` gives 1998.9999999999998).
 * Two decimals at most: a third would silently round into the threshold Orb evaluates.
 */
export function parseThreshold(input: string): ParsedThreshold {
    const trimmed = input.trim().replace(/\s/g, '').replace(/^\$/, '');
    if (!trimmed) {
        return { ok: false, error: 'Enter an amount' };
    }

    // Separators have to group properly rather than just being stripped: `1,2` is a typo, and
    // dropping the comma would silently turn it into 12.
    const grouped = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/;
    const plain = /^\d+(\.\d{1,2})?$/;
    if (!(trimmed.includes(',') ? grouped : plain).test(trimmed)) {
        return { ok: false, error: 'Enter an amount like 50 or 49.99' };
    }

    const [whole, fraction] = trimmed.replace(/,/g, '').split('.');
    const thresholdInCents = Number(whole) * 100 + Number((fraction ?? '').padEnd(2, '0'));
    if (thresholdInCents <= 0) {
        return { ok: false, error: 'Enter an amount greater than 0' };
    }
    if (thresholdInCents > MAX_THRESHOLD_IN_CENTS) {
        return { ok: false, error: 'Enter an amount of at most 10,000,000' };
    }

    return { ok: true, thresholdInCents };
}

/** The saved threshold back in the form: `50`, not `50.00`, so editing starts from what was typed. */
export function thresholdToInput(thresholdInCents: number): string {
    return thresholdInCents % 100 === 0 ? String(thresholdInCents / 100) : (thresholdInCents / 100).toFixed(2);
}

/**
 * The currency's symbol for the amount field's prefix, or null when there's none to show — Orb
 * bills some customers in units that aren't a currency, and a guessed `$` there would misstate what
 * the customer is typing.
 */
export function currencySymbol(currency: string | null): string | null {
    const code = currency?.trim().toUpperCase();
    if (!code || !/^[A-Z]{3}$/.test(code)) {
        return null;
    }

    const symbol = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).formatToParts(0).find((part) => part.type === 'currency')?.value;

    return symbol ?? null;
}
