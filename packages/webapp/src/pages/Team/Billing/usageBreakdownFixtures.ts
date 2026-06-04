import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/utils/api';

import type { AnyBreakdownDimension } from './usageBreakdown';
import type { BillingUsageMetric, GetConnections, GetIntegrations, UsageMetric } from '@nangohq/types';

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

/**
 * Synthesize a breakdown for one metric: a Zipf-ish split of the (real or
 * default) total across the candidate values, top-N kept and the long tail
 * collapsed into a 'rest' bucket, each with a daily series. Periodic metrics get
 * a bursty per-day series that sums to the share; cumulative metrics get a
 * ramp-then-plateau series so the stacked areas build up to the total.
 */
export function buildFixtureBreakdownEntries(opts: {
    metric: UsageMetric;
    dimension: AnyBreakdownDimension;
    values: string[];
    timeframe: { start: string; end: string };
    top: number;
    viewMode: 'cumulative' | 'periodic';
    total?: number | undefined;
}): BillingUsageMetric[] {
    const { metric, dimension, values, timeframe, top, viewMode } = opts;
    if (values.length === 0) {
        return [];
    }

    const total = opts.total && opts.total > 0 ? opts.total : DEFAULT_TOTALS[metric];
    const days = daysInTimeframe(timeframe);

    const ranked = values.map((v, i) => ({ v, w: 1 / Math.pow(1 + i + seeded(`${dimension}:${v}`), 1.1) })).sort((a, b) => b.w - a.w);
    const totalWeight = ranked.reduce((s, r) => s + r.w, 0) || 1;
    const topItems = ranked.slice(0, top);
    const restItems = ranked.slice(top);

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

    const entries: BillingUsageMetric[] = topItems.map(({ v, w }) => {
        const share = (total * w) / totalWeight;
        return {
            externalId: `fixture:${dimension}:${v}`,
            group: { key: dimension, value: v },
            total: Math.round(share),
            usage: makeUsage(v, share),
            view_mode: viewMode
        };
    });

    if (restItems.length > 0) {
        const restWeight = restItems.reduce((s, r) => s + r.w, 0);
        const restShare = (total * restWeight) / totalWeight;
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
