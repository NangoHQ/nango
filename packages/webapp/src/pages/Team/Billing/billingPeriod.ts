/**
 * Midnight UTC on the 1st of the next month, which is the boundary behind both dates the summary
 * strip shows.
 *
 * Free's caps are measured over the UTC calendar month regardless of signup date —
 * `getCurrentMonthBillingMetrics` in `packages/usage/lib/clickhouse/clickhouse.ts` windows on
 * `Date.UTC(y, m, 1)`. Paid renewals land on the same day: the billing cycle is anchored by the Orb
 * *plan*, not the subscription, so it doesn't follow the signup date. Verified against the Orb API
 * across all 667 non-free accounts — 660 end on the 1st, and every exception is a legacy contract or
 * an expiring deal, none of which reach the "renews on" branch.
 */
export function nextUsageResetDate(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Formatted in UTC: billing period boundaries are UTC instants, so a local-time formatter can show the wrong day. */
export function formatBillingDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
