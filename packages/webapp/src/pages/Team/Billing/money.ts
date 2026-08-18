/**
 * `$1,234.56` from an integer cent amount, or null when it can't be formatted.
 *
 * Cents in, because that's what the API carries: Orb states amounts as decimal strings and the
 * server parses them to integer cents so no float math happens on the way here. Rendered in the
 * invoice's own currency so a non-USD contract isn't silently labelled in dollars.
 *
 * Null for a missing or non-ISO currency — Orb bills some customers in `credits`, which has no
 * symbol to show — so the caller can fall back rather than invent one.
 */
export function formatMoneyFromCents(amountInCents: number, currency: string | null): string | null {
    if (!Number.isFinite(amountInCents)) {
        return null;
    }

    const code = currency?.trim().toUpperCase();
    if (!code || !/^[A-Z]{3}$/.test(code)) {
        return null;
    }

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amountInCents / 100);
}
