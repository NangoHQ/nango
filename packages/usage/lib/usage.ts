import tracer from 'dd-trace';

import db from '@nangohq/database';
import { records } from '@nangohq/records';
import { connectionService, environmentService, getPlan } from '@nangohq/shared';
import { ENVS, Err, Ok, parseEnvs } from '@nangohq/utils';

import { UsageBillingClient } from './billing.js';
import { UsageCache } from './cache.js';
import { Clickhouse } from './clickhouse/clickhouse.js';
import { logger } from './logger.js';
import { usageMetrics } from './metrics.js';

import type { CounterUsageMetric, GetDailySumAndBatchesResult, GetDailySumAndBatchesSeries, GetUsageResult } from './clickhouse/clickhouse.query.js';
import type { getRedis } from '@nangohq/kvstore';
import type { BillingUsageMetric, BillingUsageMetrics, GetBillingUsageOpts, UsageMetric } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const parsedEnvs = parseEnvs(ENVS);

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
    // Read-only client for the dashboard CH path (guarded by
    // USAGE_BILLING_FROM_CLICKHOUSE). Lazy-init keeps the dependency out
    // of code paths that never read billing usage from CH.
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
        // CH-only dashboard path. Skips Orb entirely for the dashboard shape
        // (granularity='day' + explicit timeframe). Counter metrics use
        // `Clickhouse.getUsage`, AVG metrics use `getDailySumAndBatches` +
        // `toRunningAvgUsage`. Errors propagate — no silent Orb fallback,
        // so any regression surfaces immediately in dev.
        //
        // Capping (`getBillingMetrics`, no granularity / timeframe) continues
        // to use the Orb path regardless of the flag — the CH side doesn't
        // have an equivalent of Orb's "current period totals" yet.
        //
        // The dim breakdown wiring belongs to a follow-up — `BillingUsageMetric`
        // is single-series, so it can't represent per-dim panels here yet.
        //
        // `opts.source` is a per-request override (webapp reads it from
        // `localStorage('nango.billingUsageSource')` and forwards as a query
        // param). When set, it takes precedence over the env-level default —
        // lets dev tools flip paths without a redeploy.
        const sourceIsClickhouse = opts?.source ? opts.source === 'clickhouse' : parsedEnvs.USAGE_BILLING_FROM_CLICKHOUSE;
        const useClickhouseForDashboard = sourceIsClickhouse && opts?.granularity === 'day' && opts.timeframe?.start && opts.timeframe?.end;

        if (useClickhouseForDashboard) {
            return this.getBillingUsageFromClickhouse(accountId, opts.timeframe!);
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
     * Reads all 7 billable metrics (5 counter + 2 AVG) from ClickHouse and
     * shapes them into BillingUsageMetric. Skips Orb entirely.
     */
    private async getBillingUsageFromClickhouse(accountId: number, timeframe: { start: Date; end: Date }): Promise<Result<BillingUsageMetrics>> {
        const counterMetrics: CounterUsageMetric[] = ['proxy', 'function_executions', 'function_logs', 'function_compute_gbms', 'webhook_forwards'];

        const ch = this.getClickhouse();
        const [counterRes, recordsRes, connectionsRes] = await Promise.all([
            ch.getUsage({
                accountId,
                granularity: 'day',
                timeframe,
                metrics: Object.fromEntries(counterMetrics.map((m) => [m, { dimension: 'none' as const }]))
            }),
            ch.getDailySumAndBatches({ accountId, metric: 'records', dimension: 'none', timeframe }),
            ch.getDailySumAndBatches({ accountId, metric: 'connections', dimension: 'none', timeframe })
        ]);

        if (counterRes.isErr()) {
            return Err(counterRes.error);
        }
        if (recordsRes.isErr()) {
            return Err(recordsRes.error);
        }
        if (connectionsRes.isErr()) {
            return Err(connectionsRes.error);
        }

        const result: BillingUsageMetrics = {};
        for (const metric of counterMetrics) {
            const m = counterRes.value.metrics[metric];
            if (m) {
                result[metric] = toCounterBillingMetric(metric, m);
            }
        }
        result.records = toRunningAvgUsage(recordsRes.value)[0];
        result.connections = toRunningAvgUsage(connectionsRes.value)[0];
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

/**
 * Single-metric counter result from `Clickhouse.getUsage` → `BillingUsageMetric`.
 * No dim, so we take the single series and map per-day dataPoints into the
 * `usage` array. Counter metrics are always `view_mode='periodic'` (Orb's same
 * shape — daily deltas not running totals); the dashboard adds them itself if
 * needed.
 */
type CounterUsageMetricResult = NonNullable<GetUsageResult['metrics'][CounterUsageMetric]>;

export function toCounterBillingMetric(metric: CounterUsageMetric, result: CounterUsageMetricResult): BillingUsageMetric {
    // With `dimension: 'none'` the result has exactly one series; the inner
    // dataPoints carry per-day quantities sized by the query's timeframe.
    const series = result.series[0];
    const dataPoints = series && 'dataPoints' in series ? series.dataPoints : [];
    return {
        externalId: metric,
        total: result.total,
        usage: dataPoints.map((dp) => ({
            timeframeStart: dp.timeframe.start,
            timeframeEnd: dp.timeframe.end,
            quantity: dp.quantity
        })),
        view_mode: 'periodic'
    };
}
