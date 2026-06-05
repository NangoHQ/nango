import { useQuery } from '@tanstack/react-query';

import { FIXTURE_ACCOUNTS } from './usageBreakdownFixtureData';
import { apiFetch } from '@/utils/api';

import type { AnyBreakdownDimension } from './usageBreakdown';
import type { ApiBillingUsageMetric, BillingUsageMetric, GetConnections, GetIntegrations, UsageMetric } from '@nangohq/types';

const CUMULATIVE_METRICS: readonly UsageMetric[] = ['connections', 'records'];

// Metric display labels (mirror of the server-side formatter), used by the mock
// base metric so panels show a label even when the current account omits the metric.
const METRIC_LABELS: Record<UsageMetric, string> = {
    proxy: 'Proxy requests',
    connections: 'Connections',
    function_executions: 'Function runs',
    function_compute_gbms: 'Function time (ms)',
    function_logs: 'Function logs',
    records: 'Sync records',
    webhook_forwards: 'Webhook forwarding'
};

/** Accounts available in the fixtures dropdown (id + label). */
export const FIXTURE_ACCOUNT_OPTIONS = FIXTURE_ACCOUNTS.map((a) => ({ id: a.id, label: a.label }));
export const DEFAULT_FIXTURE_ACCOUNT_ID = FIXTURE_ACCOUNTS[0]?.id ?? '';
/** URL query param holding the selected fixture account (shared by the selector and the panels). */
export const FIXTURE_ACCOUNT_PARAM = 'fixtureAccount';

function monthKey(month: Date): string {
    return `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Real prod breakdown captured for this (account, month, metric, dimension), or
 * undefined if we didn't capture it. Reconstructs the `BillingUsageMetric[]` the
 * UI expects from the compact `[day, quantity]` pairs.
 */
export function getCapturedFixtureEntries(
    accountId: string,
    month: Date,
    metric: UsageMetric,
    dimension: AnyBreakdownDimension
): BillingUsageMetric[] | undefined {
    const account = FIXTURE_ACCOUNTS.find((a) => a.id === accountId) ?? FIXTURE_ACCOUNTS[0];
    const series = account?.breakdowns[monthKey(month)]?.[metric]?.[dimension];
    if (!series || series.length === 0) {
        return undefined;
    }
    const view_mode = CUMULATIVE_METRICS.includes(metric) ? 'cumulative' : 'periodic';
    return series.map((s) => ({
        externalId: `fixture:${dimension}:${s.value}`,
        group: { key: dimension, value: s.value },
        ...(s.isRest ? { isRest: true as const } : {}),
        total: s.total,
        usage: s.usage.map(([day, quantity]) => {
            const start = new Date(`${day}T00:00:00.000Z`);
            const end = new Date(start);
            end.setUTCDate(start.getUTCDate() + 1);
            return { timeframeStart: start, timeframeEnd: end, quantity };
        }),
        view_mode
    }));
}

/**
 * Mock no-breakdown base metric for a fixture account/month, so the non-breakdown
 * panels show the selected account's data too. Derived by summing the captured
 * `integration_id` breakdown per day (it includes the 'rest' bucket, so the sum is
 * the true daily total / running average). Returns undefined if not captured.
 */
export function getCapturedBaseMetric(accountId: string, month: Date, metric: UsageMetric): ApiBillingUsageMetric | undefined {
    const account = FIXTURE_ACCOUNTS.find((a) => a.id === accountId) ?? FIXTURE_ACCOUNTS[0];
    if (!account) {
        return undefined;
    }
    const view_mode = CUMULATIVE_METRICS.includes(metric) ? 'cumulative' : 'periodic';
    const byDim = account.breakdowns[monthKey(month)]?.[metric];
    const series = byDim?.integration_id ?? byDim?.environment_id;
    if (!series || series.length === 0) {
        // The fixture account exists but doesn't use this metric → render an empty
        // panel ("No data") rather than leaking the current account's real totals.
        return { externalId: `fixture:${metric}`, label: METRIC_LABELS[metric], total: 0, usage: [], view_mode };
    }
    const byDay = new Map<string, number>();
    for (const s of series) {
        for (const [day, quantity] of s.usage) {
            byDay.set(day, (byDay.get(day) ?? 0) + quantity);
        }
    }
    const usage = [...byDay.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([day, quantity]) => {
            const start = new Date(`${day}T00:00:00.000Z`);
            const end = new Date(start);
            end.setUTCDate(start.getUTCDate() + 1);
            return { timeframeStart: start, timeframeEnd: end, quantity };
        });
    return {
        externalId: `fixture:${metric}`,
        label: METRIC_LABELS[metric],
        total: series.reduce((sum, s) => sum + s.total, 0),
        usage,
        view_mode
    };
}

/**
 * Dev-only fixtures for the usage breakdown UI. Lets us preview the dense /
 * long-tail layout before the backend serves real breakdowns: it pulls the real
 * integration / connection names from the running environment and synthesizes a
 * plausible (made-up) distribution + daily series across them. Gated behind the
 * `usageBreakdownFixtures` dev flag; never reachable in production.
 */

// Synthetic value pools for dimensions with no convenient list endpoint.
const SYNTHETIC_VALUES: Partial<Record<AnyBreakdownDimension, string[]>> = {
    model: [
        'Contact',
        'Account',
        'Deal',
        'Lead',
        'Opportunity',
        'Ticket',
        'Invoice',
        'Message',
        'Calendar',
        'Event',
        'User',
        'Task',
        'Note',
        'Email',
        'Document',
        'Project',
        'Issue',
        'Comment'
    ],
    function_name: [
        'syncContacts',
        'syncDeals',
        'syncAccounts',
        'sendEmail',
        'createTicket',
        'fetchInvoices',
        'updateRecord',
        'syncCalendar',
        'listMessages',
        'exportData',
        'importLeads',
        'refreshTokens'
    ],
    function_type: ['sync', 'action', 'webhook', 'on-event'],
    success: ['true', 'false'],
    environment_id: ['prod', 'dev', 'staging']
};

/**
 * Candidate dimension values for fixtures. Integration / connection names are
 * fetched live from the env (so they're real); everything else is synthetic.
 * Both queries only run when fixtures are active for that dimension.
 */
export function useFixtureDimensionValues(env: string, dimension: AnyBreakdownDimension | null, enabled: boolean): { values: string[]; isLoading: boolean } {
    const integrationsQuery = useQuery<string[]>({
        queryKey: ['fixtureValues', 'integrations', env],
        enabled: enabled && dimension === 'integration_id' && Boolean(env),
        queryFn: async () => {
            const res = await apiFetch(`/api/v1/integrations?env=${env}`, { method: 'GET' });
            const json = (await res.json()) as GetIntegrations['Reply'];
            if (!res.ok || 'error' in json) {
                throw new Error('Failed to load integrations for fixtures');
            }
            return json.data.map((i) => i.unique_key);
        }
    });

    const connectionsQuery = useQuery<string[]>({
        queryKey: ['fixtureValues', 'connections', env],
        enabled: enabled && dimension === 'connection_id' && Boolean(env),
        queryFn: async () => {
            const res = await apiFetch(`/api/v1/connections?env=${env}&page=0`, { method: 'GET' });
            const json = (await res.json()) as GetConnections['Reply'];
            if (!res.ok || 'error' in json) {
                throw new Error('Failed to load connections for fixtures');
            }
            return json.data.map((c) => c.connection_id);
        }
    });

    if (!enabled || dimension === null) {
        return { values: [], isLoading: false };
    }
    if (dimension === 'integration_id') {
        return { values: integrationsQuery.data ?? [], isLoading: integrationsQuery.isLoading };
    }
    if (dimension === 'connection_id') {
        return { values: connectionsQuery.data ?? [], isLoading: connectionsQuery.isLoading };
    }
    return { values: SYNTHETIC_VALUES[dimension] ?? [], isLoading: false };
}

// Per-metric magnitudes used when the real base total isn't available.
const DEFAULT_TOTALS: Record<UsageMetric, number> = {
    proxy: 48_000,
    webhook_forwards: 9_000,
    function_executions: 130_000,
    function_compute_gbms: 16_000_000_000,
    function_logs: 32_000,
    records: 85_000,
    connections: 320
};

// Stable [0,1) hash so daily jitter doesn't flicker between renders.
function seeded(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100_000) / 100_000;
}

function daysInTimeframe(timeframe: { start: string; end: string }): Date[] {
    const days: Date[] = [];
    const cur = new Date(timeframe.start);
    cur.setUTCHours(0, 0, 0, 0);
    const end = new Date(timeframe.end);
    end.setUTCHours(0, 0, 0, 0);
    while (cur < end) {
        days.push(new Date(cur));
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return days;
}

function dayUsage(day: Date, quantity: number): { timeframeStart: Date; timeframeEnd: Date; quantity: number } {
    const next = new Date(day);
    next.setUTCDate(day.getUTCDate() + 1);
    return { timeframeStart: day, timeframeEnd: next, quantity };
}

// Dimensions whose real cardinality can be large in production. We pad them with
// synthetic extras so fixtures always show a long tail (and a dominant 'rest')
// even on a sparse env like dev — real names stay in the visible top-N.
const LONG_TAIL_DIMENSIONS: readonly AnyBreakdownDimension[] = ['integration_id', 'connection_id', 'model', 'function_name'];
const FIXTURE_MIN_VALUES = 48;

function pseudoUuid(i: number): string {
    const seg = (k: string, n: number) =>
        Math.floor(seeded(`${k}:${i}`) * 0xffffffff)
            .toString(16)
            .padStart(8, '0')
            .slice(0, n);
    return `${seg('a', 8)}-${seg('b', 4)}-${seg('c', 4)}-${seg('d', 4)}-${seg('e', 8)}${seg('f', 4)}`;
}

function syntheticPadValue(dimension: AnyBreakdownDimension, i: number): string {
    switch (dimension) {
        case 'connection_id':
            return pseudoUuid(i);
        case 'integration_id':
            return `vendor-${i + 1}`;
        case 'model':
            return `Model${i + 1}`;
        case 'function_name':
            return `function${i + 1}`;
        default:
            return `value-${i + 1}`;
    }
}

// Keep the real values (shown in the visible top-N) and pad the tail so there's
// always a meaningful 'rest'. Low-cardinality dimensions are left untouched.
function padValues(dimension: AnyBreakdownDimension, values: string[]): string[] {
    if (!LONG_TAIL_DIMENSIONS.includes(dimension) || values.length >= FIXTURE_MIN_VALUES) {
        return values;
    }
    const padded = [...values];
    let i = 0;
    while (padded.length < FIXTURE_MIN_VALUES) {
        const v = syntheticPadValue(dimension, i);
        if (!padded.includes(v)) {
            padded.push(v);
        }
        i++;
    }
    return padded;
}

/**
 * Synthesize a breakdown for one metric using a large made-up magnitude (so the
 * preview shows "much more data" regardless of the real, often-tiny total): the
 * top-N get a gentle decay so each is clearly non-zero, and the long tail is
 * reserved as a single 'rest' bucket. Periodic metrics get a bursty per-day
 * series; cumulative metrics ramp-then-plateau so stacked areas build to the total.
 */
export function buildFixtureBreakdownEntries(opts: {
    metric: UsageMetric;
    dimension: AnyBreakdownDimension;
    values: string[];
    timeframe: { start: string; end: string };
    top: number;
    viewMode: 'cumulative' | 'periodic';
}): BillingUsageMetric[] {
    const { metric, dimension, timeframe, top, viewMode } = opts;
    const padded = padValues(dimension, opts.values);
    if (padded.length === 0) {
        return [];
    }

    // Fixtures use a large made-up magnitude (not the real, often-tiny base total)
    // so the preview shows "much more data". A gentle decay across the top-N keeps
    // every visible series clearly non-zero; the long tail is reserved as 'rest'.
    const total = DEFAULT_TOTALS[metric];
    const days = daysInTimeframe(timeframe);

    const topVals = padded.slice(0, top);
    const restCount = padded.length - topVals.length;

    const REST_FRACTION = restCount > 0 ? 0.35 : 0;
    const topBudget = total * (1 - REST_FRACTION);
    const topWeights = topVals.map((_, i) => 1 / Math.pow(i + 1, 0.6)); // gentle so the smallest top-N is still visible
    const topWeightSum = topWeights.reduce((s, w) => s + w, 0) || 1;

    const makeUsage = (value: string, share: number) => {
        if (viewMode === 'cumulative') {
            const ramp = Math.max(3, Math.floor(days.length / 3));
            return days.map((d, i) => {
                const grow = Math.min(1, (i + 1) / ramp);
                const jitter = 0.9 + 0.2 * seeded(`${value}:${i}`);
                return dayUsage(d, Math.round(share * grow * jitter));
            });
        }
        const weights = days.map((_, i) => 0.3 + seeded(`${value}:${i}`));
        const wsum = weights.reduce((s, w) => s + w, 0) || 1;
        return days.map((d, i) => dayUsage(d, Math.round((share * weights[i]) / wsum)));
    };

    const entries: BillingUsageMetric[] = topVals.map((v, i) => {
        const share = (topBudget * topWeights[i]) / topWeightSum;
        return {
            externalId: `fixture:${dimension}:${v}`,
            group: { key: dimension, value: v },
            total: Math.round(share),
            usage: makeUsage(v, share),
            view_mode: viewMode
        };
    });

    if (restCount > 0) {
        const restShare = total * REST_FRACTION;
        entries.push({
            externalId: `fixture:${dimension}:rest`,
            group: { key: dimension, value: 'rest' },
            isRest: true,
            total: Math.round(restShare),
            usage: makeUsage('rest', restShare),
            view_mode: viewMode
        });
    }

    return entries;
}
