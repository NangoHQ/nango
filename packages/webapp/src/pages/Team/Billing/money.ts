/**
 * `$1,234.56` from an integer cent amount, in the invoice's own currency. Null for a missing or
 * non-ISO currency — Orb bills some customers in `credits` — so callers fall back rather than
 * invent a symbol.
 */
export function formatMoneyFromCents(amountInCents: number, currency: string | null): string | null {
    if (!Number.isFinite(amountInCents)) {
        return null;
    }

    const code = currency?.trim().toUpperCase();
    if (!code || !/^[A-Z]{3}$/.test(code)) {
        return null;
    }

    // No fraction-digit overrides: Intl uses each currency's own precision, so JPY doesn't gain a ".00".
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amountInCents / 100);
}
