/**
 * When the Free plan's usage caps reset: midnight UTC on the 1st. The caps are measured over the UTC
 * calendar month for every account regardless of signup date — see `getCurrentMonthBillingMetrics`
 * in `packages/usage/lib/clickhouse/clickhouse.ts`, which windows on `Date.UTC(y, m, 1)`.
 *
 * Paid plans have no caps; their period comes from Orb (`/plans/subscription`) and is anchored to the
 * subscription's start date, so it usually isn't the 1st.
 */
export function nextUsageResetDate(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Formatted in UTC: billing period boundaries are UTC instants, so a local-time formatter can show the wrong day. */
export function formatBillingDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
