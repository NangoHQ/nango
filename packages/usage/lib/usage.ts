import tracer from 'dd-trace';

import db from '@nangohq/database';
import { records } from '@nangohq/records';
import { connectionService, environmentService, getPlan } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { UsageBillingClient } from './billing.js';
import { UsageCache } from './cache.js';
import { Clickhouse } from './clickhouse/clickhouse.js';
import { AVG_METRICS, COUNTER_METRICS } from './clickhouse/clickhouse.query.js';
import { envs } from './env.js';
import { logger } from './logger.js';
import { usageMetrics } from './metrics.js';

import type {
    AvgUsageMetric,
    CounterUsageMetric,
    GetDailyCounterResult,
    GetDailySumAndBatchesResult,
    GetDailySumAndBatchesSeries
} from './clickhouse/clickhouse.query.js';
import type { getRedis } from '@nangohq/kvstore';
import type { BillingUsageMetric, BillingUsageMetrics, GetBillingUsageOpts, UsageMetric } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const cacheKeyPrefix = 'usageV2';

export interface UsageStatus {
    accountId: number;
    metric: UsageMetric;
    current: number;
}

export interface IUsageTracker {
    get(params: { accountId: number; metric: UsageMetric }): Promise<Result<UsageStatus>>;
    getAll(accountId: number): Promise<Result<Record<UsageMetric, UsageStatus>>>;
    incr(params: { accountId: number; metric: UsageMetric; delta?: number; forceRevalidation?: boolean }): Promise<Result<UsageStatus>>;
    revalidate({ accountId, metric }: { accountId: number; metric: UsageMetric }): Promise<Result<void>>;
    getBillingUsage(subscriptionId: string, accountId: number, opts?: GetBillingUsageOpts): Promise<Result<BillingUsageMetrics>>;
}

export class UsageTrackerNoOps implements IUsageTracker {
    public async get({ accountId, metric }: { accountId: number; metric: UsageMetric }): Promise<Result<UsageStatus>> {
        return Promise.resolve(
            Ok({
                accountId,
                metric,
                current: 0
            })
        );
    }

    public async getAll(accountId: number): Promise<Result<Record<UsageMetric, UsageStatus>>> {
        const result: Record<UsageMetric, UsageStatus> = {} as Record<UsageMetric, UsageStatus>;
        for (const metric of Object.keys(usageMetrics) as UsageMetric[]) {
            result[metric] = {
                accountId,
                metric,
                current: 0
            };
        }
        return Promise.resolve(Ok(result));
    }

    public async incr({ accountId, metric, delta = 1 }: { accountId: number; metric: UsageMetric; delta?: number }): Promise<Result<UsageStatus>> {
        return Promise.resolve(
            Ok({
                accountId,
                metric,
                current: delta
            })
        );
    }

    public async revalidate(): Promise<Result<void>> {
        return Promise.resolve(Ok(undefined));
    }

    public async getBillingUsage(): Promise<Result<BillingUsageMetrics>> {
        return Promise.resolve(Ok({}));
    }
}

export class UsageTracker implements IUsageTracker {
    private cache: UsageCache;
    public billingClient: UsageBillingClient;
    // Read-only client for the dashboard CH path (gated by
    // ALLOW_OVERRIDE_GETUSAGE_SERVICE + per-request `source` override).
    // Lazy-init keeps the dependency out of code paths that never read
    // billing usage from CH.
    private clickhouse: Clickhouse | null = null;

    constructor(redis: Awaited<ReturnType<typeof getRedis>>) {
        this.cache = new UsageCache(redis);
        this.billingClient = new UsageBillingClient(redis);
    }

    private getClickhouse(): Clickhouse {
        if (!this.clickhouse) {
            this.clickhouse = new Clickhouse();
        }
        return this.clickhouse;
    }

    public async get({ accountId, metric }: { accountId: number; metric: UsageMetric }): Promise<Result<UsageStatus>> {
        const now = new Date();
        const { cacheKey } = UsageTracker.getCacheEntryProps({ accountId, metric, now });
        const entry = await this.cache.get(cacheKey);
        if (entry.isErr()) {
            return Err(entry.error);
        }
        if (entry.value === null || entry.value.revalidateAfter < now.getTime()) {
            void this.revalidate({ accountId, metric });
        }
        return Ok({
            accountId,
            metric,
            current: entry.value?.count || 0
        });
    }

    public async getAll(accountId: number): Promise<Result<Record<UsageMetric, UsageStatus>>> {
        const now = new Date();
        const result: Record<UsageMetric, UsageStatus> = {} as Record<UsageMetric, UsageStatus>;
        await Promise.all(
            Object.keys(usageMetrics).map(async (metric) => {
                const { cacheKey } = UsageTracker.getCacheEntryProps({ accountId, metric: metric as UsageMetric, now });
                const entry = await this.cache.get(cacheKey);
                if (entry.isErr()) {
                    return;
                }
                if (entry.value === null || entry.value.revalidateAfter < now.getTime()) {
                    void this.revalidate({ accountId, metric: metric as UsageMetric });
                }
                result[metric as UsageMetric] = {
                    accountId,
                    metric: metric as UsageMetric,
                    current: entry.value?.count || 0
                };
            })
        );
        return Ok(result);
    }

    public async incr({
        accountId,
        metric,
        delta = 1,
        forceRevalidation = false
    }: {
        accountId: number;
        metric: UsageMetric;
        delta?: number;
        forceRevalidation?: boolean;
    }): Promise<Result<UsageStatus>> {
        const now = new Date();
        const { cacheKey, ttlMs } = UsageTracker.getCacheEntryProps({ accountId, metric, now });
        const entry = await this.cache.incr(cacheKey, { delta, ttlMs });
        if (entry.isErr()) {
            return Err(entry.error);
        }

        // revalidate if:
        // - forced
        // - or the entry is stale
        if (forceRevalidation || (entry.value.revalidateAfter && entry.value.revalidateAfter < now.getTime())) {
            void this.revalidate({ accountId, metric });
        }

        return Ok({
            accountId,
            metric,
            current: entry.value.count
        });
    }

    public async revalidate({ accountId, metric }: { accountId: number; metric: UsageMetric }): Promise<Result<void>> {
        const source = sources[metric];
        const span = tracer.startSpan('nango.usage.revalidate', {
            tags: { accountId, metric, source }
        });
        // Acquire a lock to avoid multiple revalidations in parallel
        const lockKey = `${cacheKeyPrefix}:revalidate:${accountId}:${source}`;
        const lock = await this.cache.tryAcquireLock(lockKey, { ttlMs: 60_000 });
        if (lock.isErr()) {
            // another revalidation is in progress, skip
            return Ok(undefined);
        }
        try {
            const now = new Date();
            switch (metric) {
                case 'connections': {
                    const count = await connectionService.countByAccountId(accountId);
                    const { cacheKey } = UsageTracker.getCacheEntryProps({ accountId, metric, now });
                    await this.cache.overwrite(cacheKey, count);
                    return Ok(undefined);
                }
                case 'records': {
                    const count = await this.getRecordsUsage(accountId);
                    if (count.isErr()) {
                        throw count.error;
                    }
                    const { cacheKey } = UsageTracker.getCacheEntryProps({ accountId, metric, now });
                    await this.cache.overwrite(cacheKey, count.value);
                    span?.setTag('count', count.value);
                    return Ok(undefined);
                }
                case 'proxy':
                case 'function_executions':
                case 'function_compute_gbms':
                case 'webhook_forwards':
                case 'function_logs': {
                    const billingUsage = await this.getBillingMetrics(accountId);
                    if (billingUsage.isErr()) {
                        if (billingUsage.error.message === 'rate_limit_exceeded') {
                            span?.setTag('rate_limited', true);
                        }
                        throw billingUsage.error;
                    }
                    // update all billing-related metrics
                    for (const [metric, count] of Object.entries(billingUsage.value)) {
                        const { cacheKey } = UsageTracker.getCacheEntryProps({ accountId, metric: metric as UsageMetric, now });
                        await this.cache.overwrite(cacheKey, count);
                    }
                    return Ok(undefined);
                }
                default: {
                    ((_exhaustiveCheck: never) => {
                        throw new Error(`Unhandled usage metric type: ${metric}`);
                    })(metric);
                }
            }
        } catch (err) {
            logger.error(`Failed to revalidate usage for accountId: ${accountId}, metric: ${metric}`, err);
            span?.setTag('error', err);
            return Err(new Error('usage_revalidate_error'));
        } finally {
            span?.finish();
            // Note: not releasing the lock to avoid quick re-entrance in case of error
        }
    }

    public async getBillingUsage(subscriptionId: string, accountId: number, opts?: GetBillingUsageOpts): Promise<Result<BillingUsageMetrics>> {
        // CH path: dashboard shape only (granularity='day' + timeframe), and
        // only when the env gate is on AND the request opted in via `source`.
        // No silent Orb fallback on error — surfaces regressions in dev.
        // Capping (`getBillingMetrics`, no granularity) stays on Orb.
        const requestedSource = envs.ALLOW_OVERRIDE_GETUSAGE_SERVICE ? opts?.source : undefined;
        const useClickhouseForDashboard = requestedSource === 'clickhouse' && opts?.granularity === 'day' && opts.timeframe?.start && opts.timeframe?.end;

        if (useClickhouseForDashboard) {
            return this.getBillingUsageFromClickhouse(accountId, {
                timeframe: opts.timeframe!,
                ...(opts.metrics ? { metrics: opts.metrics } : {}),
                ...(opts.breakdown ? { breakdown: opts.breakdown } : {}),
                ...(opts.top !== undefined ? { top: opts.top } : {})
            });
        }

        const billingUsageMetrics = await this.billingClient.getUsage(subscriptionId, opts);
        if (billingUsageMetrics.isErr()) {
            return billingUsageMetrics;
        }

        return Ok({
            ...billingUsageMetrics.value,
            connections: billingUsageMetrics.value.connections ? toCumulativeUsage(billingUsageMetrics.value.connections) : undefined,
            records: billingUsageMetrics.value.records ? toCumulativeUsage(billingUsageMetrics.value.records) : undefined
        });
    }

    /**
     * Fan-out over in-scope metrics: counters via `getDailyCounter`, AVG via
     * `getDailySumAndBatches`. When `breakdown` is set for a metric, ONLY the
     * breakdown call runs — the returned BillingUsageMetric for that metric
     * carries `usage: []` / `total: 0` at the top level and only `breakdown`
     * populated. The caller opted into the per-dim view; the global can be
     * derived by summing across breakdown series (top-N + 'rest' partition
     * every row) but we don't pre-compute it.
     */
    private async getBillingUsageFromClickhouse(
        accountId: number,
        opts: {
            timeframe: { start: Date; end: Date };
            metrics?: UsageMetric[];
            breakdown?: Partial<Record<UsageMetric, string>>;
            top?: number;
        }
    ): Promise<Result<BillingUsageMetrics>> {
        const { timeframe, metrics: scopedMetrics, breakdown, top } = opts;
        const scope = scopedMetrics ? new Set(scopedMetrics) : null;
        const counterMetrics: CounterUsageMetric[] = scope ? COUNTER_METRICS.filter((m) => scope.has(m)) : [...COUNTER_METRICS];
        const avgMetrics: AvgUsageMetric[] = scope ? AVG_METRICS.filter((m) => scope.has(m)) : [...AVG_METRICS];
        // Metrics with a breakdown skip the no-dim base call — see method docstring.
        const counterNoDim = counterMetrics.filter((m) => !breakdown?.[m]);
        const avgNoDim = avgMetrics.filter((m) => !breakdown?.[m]);
        const ch = this.getClickhouse();

        const counterBaseP = Promise.all(
            counterNoDim.map((m) => ch.getDailyCounter({ accountId, metric: m, dimension: 'none', timeframe }).then((r) => [m, r] as const))
        );
        const avgBaseP = Promise.all(
            avgNoDim.map((m) => ch.getDailySumAndBatches({ accountId, metric: m, dimension: 'none', timeframe }).then((r) => [m, r] as const))
        );

        // Breakdown requests, split by family so each Promise has a single
        // concrete Result type (counter vs AVG result shapes differ). The CH
        // SQL already bounds each to top-N + 'rest'; `top` overrides N per
        // request. `flatMap` lets us skip metrics with no breakdown requested.
        //
        // `dim as never`: the per-metric dim union can't narrow inside a
        // flatMap over a metric union — TS sees a wide string. Controller
        // validates `(metric, dim)` against `BREAKDOWN_DIMENSIONS` before we
        // reach here, so the cast is safe.
        const counterBreakdownP = Promise.all(
            counterMetrics.flatMap((m) => {
                const dim = breakdown?.[m];
                if (!dim) return [];
                return [
                    ch
                        .getDailyCounter({
                            accountId,
                            metric: m,
                            dimension: dim as never,
                            timeframe,
                            ...(top !== undefined ? { top } : {})
                        })
                        .then((r) => [m, r] as const)
                ];
            })
        );
        const avgBreakdownP = Promise.all(
            avgMetrics.flatMap((m) => {
                const dim = breakdown?.[m];
                if (!dim) return [];
                return [
                    ch
                        .getDailySumAndBatches({
                            accountId,
                            metric: m,
                            dimension: dim as never,
                            timeframe,
                            ...(top !== undefined ? { top } : {})
                        })
                        .then((r) => [m, r] as const)
                ];
            })
        );

        const [counterBaseResults, avgBaseResults, counterBreakdowns, avgBreakdowns] = await Promise.all([
            counterBaseP,
            avgBaseP,
            counterBreakdownP,
            avgBreakdownP
        ]);

        const result: BillingUsageMetrics = {};
        for (const [metric, res] of counterBaseResults) {
            if (res.isErr()) return Err(res.error);
            result[metric] = toCounterBillingMetric(metric, res.value);
        }
        for (const [metric, res] of avgBaseResults) {
            if (res.isErr()) return Err(res.error);
            const billing = toRunningAvgUsage(res.value)[0];
            if (billing) {
                result[metric] = billing;
            }
        }

        // Breakdown-requested metrics: emit a BillingUsageMetric with empty
        // top-level `usage` / `total: 0` and only the `breakdown` populated.
        // The caller opted into the per-dim view; we don't synthesize a global.
        for (const [metric, br] of counterBreakdowns) {
            if (br.isErr()) return Err(br.error);
            result[metric] = {
                externalId: metric,
                total: 0,
                usage: [],
                view_mode: 'periodic',
                breakdown: toCounterBillingMetricSeries(metric, br.value)
            };
        }
        for (const [metric, br] of avgBreakdowns) {
            if (br.isErr()) return Err(br.error);
            result[metric] = {
                externalId: metric,
                total: 0,
                usage: [],
                view_mode: 'cumulative',
                breakdown: toRunningAvgUsage(br.value)
            };
        }
        return Ok(result);
    }

    private static getCacheEntryProps({ accountId, metric, now }: { accountId: number; metric: UsageMetric; now: Date }): { cacheKey: string; ttlMs?: number } {
        const cacheKey = `${cacheKeyPrefix}:${accountId}:${metric}`;
        if (usageMetrics[metric].reset === 'monthly') {
            // monthly metrics have a YYYY-MM suffix
            const yyyymm = now.toISOString().slice(0, 7);
            const untilNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1); // first day of next month
            return {
                cacheKey: `${cacheKey}:${yyyymm}`,
                ttlMs: untilNextMonth.getTime() - now.getTime() + 60 * 1000 // add 1 minute buffer
            };
        }
        return { cacheKey };
    }

    private async getBillingMetrics(accountId: number): Promise<Result<Record<UsageMetric, number>>> {
        const plan = await getPlan(db.knex, { accountId });
        if (plan.isErr()) {
            return Err(plan.error);
        }
        if (!plan.value.orb_subscription_id) {
            return Err(new Error('orb_subscription_id_missing'));
        }
        // No timeframe / no granularity → CH path is bypassed inside
        // getBillingUsage, capping continues to read from Orb.
        const billingUsage: Result<BillingUsageMetrics> = await this.getBillingUsage(plan.value.orb_subscription_id, accountId);
        if (billingUsage.isErr()) {
            // Note: errors (including rate limit errors) are not being retried
            // revalidateAfter isn't being updated, so next incr will attempt to revalidate again
            return Err(billingUsage.error);
        }
        const res = {} as Record<UsageMetric, number>;
        for (const [usageMetric, billingMetric] of Object.entries(billingUsage.value)) {
            if (billingMetric) {
                res[usageMetric as UsageMetric] = billingMetric.total;
            }
        }
        return Ok(res);
    }

    private async getRecordsUsage(accountId: number): Promise<Result<number>> {
        const envs = await environmentService.getEnvironmentsByAccountId(accountId);
        let count = 0;
        if (envs.length > 0) {
            const envIds = envs.map((e) => e.id);
            for await (const recordCounts of records.paginateCounts({ environmentIds: envIds })) {
                if (recordCounts.isErr()) {
                    return Err(recordCounts.error);
                }
                if (recordCounts.value.length === 0) {
                    continue;
                }
                const connectionIds = recordCounts.value.map((r) => r.connection_id);
                for await (const connPage of connectionService.paginateConnections({ connectionIds })) {
                    if (connPage.isErr()) {
                        return Err(connPage.error);
                    }
                    for (const conn of connPage.value) {
                        // sum records data for this connection. There might be multiple models or variants for the same connection
                        const sum = recordCounts.value
                            .filter((r) => r.connection_id === conn.connection.id)
                            .reduce((acc, curr) => {
                                acc += curr.count;
                                return acc;
                            }, 0);
                        count += sum;
                    }
                }
            }
        }
        return Ok(count);
    }
}

const sources: Record<UsageMetric, string> = {
    // source of truth for connections and records is main internal db
    connections: 'db:connections',
    records: 'db:records',
    // billing related metrics are fetched from the same billing endpoint, hence the same source
    proxy: 'billing:subscription:usage',
    function_executions: 'billing:subscription:usage',
    function_compute_gbms: 'billing:subscription:usage',
    webhook_forwards: 'billing:subscription:usage',
    function_logs: 'billing:subscription:usage'
};

function toCumulativeUsage(periodicUsage: BillingUsageMetric): BillingUsageMetric {
    const orderedPeriodicUsage = periodicUsage.usage.sort((a, b) => new Date(a.timeframeStart).getTime() - new Date(b.timeframeStart).getTime());
    const cumulativeUsage: BillingUsageMetric['usage'] = [];
    let previousQuantity = 0;

    for (const usage of orderedPeriodicUsage) {
        if (usage?.quantity === undefined) {
            cumulativeUsage.push(usage);
            continue;
        }
        const quantity = usage.quantity + previousQuantity;

        cumulativeUsage.push({
            timeframeStart: usage.timeframeStart,
            timeframeEnd: usage.timeframeEnd,
            quantity: Math.floor(quantity)
        });

        previousQuantity = quantity;
    }
    return {
        ...periodicUsage,
        view_mode: 'cumulative',
        total: Math.floor(previousQuantity),
        usage: cumulativeUsage
    };
}

/**
 * CH-path sibling of `toCumulativeUsage`. Turns the per-day `(sum, batches)`
 * accumulators returned by `Clickhouse.getDailySumAndBatches` into
 * `BillingUsageMetric[]` with `view_mode='cumulative'` — the same wire shape
 * the dashboard already consumes for `records` / `connections` from the Orb
 * path. One `BillingUsageMetric` per series (no-dim → 1; dim → one per dim
 * value with `group: {key, value}`).
 *
 * Walks each series in day order, accumulates `running_sum` and
 * `running_batches`, and emits `Math.round(running_sum / running_batches)` per
 * day. Bypasses `toCumulativeUsage` because the output is already
 * cumulative-shaped (running averages, not running sums of deltas).
 *
 * Dim-breakdown additivity contract: per-dim series share the same global
 * per-day batches (by design of `getDailySumAndBatches`' dim branch), so the
 * sum of per-dim running averages equals the global running average exactly
 * at every day — the breakdown decomposes the bill total rather than being
 * a "size when active" view.
 *
 * Worked example (10×100 vs 2×1000 → 100, 250) lives in
 * `getDailySumAndBatches`' docstring.
 */
export function toRunningAvgUsage(result: GetDailySumAndBatchesResult): BillingUsageMetric[] {
    return result.series.map((series) => seriesToCumulativeAvg(result.metric, series)).filter((m): m is BillingUsageMetric => m !== null);
}

function seriesToCumulativeAvg(metric: GetDailySumAndBatchesResult['metric'], series: GetDailySumAndBatchesSeries): BillingUsageMetric | null {
    if (series.days.length === 0) {
        return null;
    }

    const sorted = [...series.days].sort((a, b) => a.day.getTime() - b.day.getTime());

    let runningSum = 0;
    let runningBatches = 0;
    const usage: BillingUsageMetric['usage'] = [];
    for (const day of sorted) {
        runningSum += day.sum;
        runningBatches += day.batches;
        if (runningBatches === 0) {
            // Defensive: a series shouldn't appear with batches=0 (the SQL filters
            // empty-day groups out), but if it does we skip rather than divide by zero.
            continue;
        }
        const quantity = Math.round(runningSum / runningBatches);
        usage.push({
            timeframeStart: day.day,
            timeframeEnd: addOneDay(day.day),
            quantity
        });
    }

    if (usage.length === 0) {
        return null;
    }

    const lastQuantity = usage[usage.length - 1]!.quantity;
    const base: BillingUsageMetric = {
        externalId: metric,
        total: lastQuantity,
        usage,
        view_mode: 'cumulative'
    };
    if ('dimension' in series) {
        base.group = { key: series.dimension, value: String(series.dimensionValue) };
    }
    return base;
}

function addOneDay(d: Date): Date {
    const out = new Date(d);
    out.setUTCDate(out.getUTCDate() + 1);
    return out;
}

// Counter metrics are always `view_mode='periodic'` (Orb's same shape — daily
// deltas not running totals); the dashboard adds them itself if needed.
export function toCounterBillingMetric(metric: CounterUsageMetric, result: GetDailyCounterResult): BillingUsageMetric {
    return toCounterBillingMetricSeries(metric, result)[0] ?? { externalId: metric, total: 0, usage: [], view_mode: 'periodic' };
}

/**
 * Multi-series counter result from `Clickhouse.getDailyCounter` with a
 * dimension set → `BillingUsageMetric[]`. One entry per series (top-N + 'rest')
 * carrying its own `group: {key, value}` so the dashboard can render them as
 * separate lines.
 */
export function toCounterBillingMetricSeries(metric: CounterUsageMetric, result: GetDailyCounterResult): BillingUsageMetric[] {
    return result.series.map((series) => {
        let total = 0;
        const usage = series.days.map((d) => {
            total += d.value;
            return {
                timeframeStart: d.day,
                timeframeEnd: addOneDay(d.day),
                quantity: d.value
            };
        });
        const out: BillingUsageMetric = {
            externalId: metric,
            total,
            usage,
            view_mode: 'periodic'
        };
        if ('dimension' in series) {
            out.group = { key: series.dimension, value: String(series.dimensionValue) };
        }
        return out;
    });
}
