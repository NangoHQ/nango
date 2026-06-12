import tracer from 'dd-trace';

import db from '@nangohq/database';
import { records } from '@nangohq/records';
import { connectionService, environmentService, getPlan } from '@nangohq/shared';
import { Err, Ok, metrics, stringifyError } from '@nangohq/utils';

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
    GetDailyCounterQuery,
    GetDailyCounterResult,
    GetDailySumAndBatchesQuery,
    GetDailySumAndBatchesResult,
    GetDailySumAndBatchesSeries,
    GetTopDimensionValuesQuery,
    GetTopDimensionValuesResult
} from './clickhouse/clickhouse.query.js';
import type { getRedis } from '@nangohq/kvstore';
import type { BillingUsageMetric, BillingUsageMetrics, BreakdownDimensions, GetBillingUsageOpts, UsageMetric } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const cacheKeyPrefix = 'usageV2';

// CH MV typed-projections started ingesting 2026-05-12; comparing earlier
// windows against Orb produces known-bad divergence (CH biases high until 30d
// of depth). Anchor the shadow to a clean post-backfill date.
const SHADOW_MIN_TIMEFRAME_START = new Date('2026-06-01T00:00:00.000Z');
// CH server-side ceiling on shadow reads. Bounded much tighter than the
// dashboard default (30s) so an abandoned shadow doesn't keep burning CH
// compute after the wall-clock race resolves.
const SHADOW_CH_MAX_EXECUTION_SECONDS = 5;
// Wall-clock fallback set ~0.5s above the CH ceiling so CH's own timeout
// reliably fires first → `outcome:ch_error` is the deterministic signal and
// the local race only catches network-level wedges.
const SHADOW_TIMEOUT_MS = SHADOW_CH_MAX_EXECUTION_SECONDS * 1000 + 500;

export function shouldShadow(opts: GetBillingUsageOpts | undefined): opts is GetBillingUsageOpts & { timeframe: { start: Date; end: Date } } {
    if (!envs.FLAG_BILLING_USAGE_SHADOW_CLICKHOUSE) return false;
    if (!opts?.timeframe?.start || !opts?.timeframe?.end) return false;
    return opts.timeframe.start >= SHADOW_MIN_TIMEFRAME_START;
}

// Per-call random sample (not account-based) so we can ramp + killswitch CH
// load without an account cohort being permanently in or out.
export function shouldShadowCapping(opts: GetBillingUsageOpts | undefined): boolean {
    if (opts?.timeframe) return false;
    const pct = envs.FLAG_BILLING_USAGE_CAPPING_SHADOW_CLICKHOUSE_PERCENTAGE;
    if (pct <= 0) return false;
    return Math.random() * 100 < pct;
}

let cachedAllowlistCsv: string | undefined;
let cachedAllowlist = new Set<number>();
function getRolloutAllowlist(): Set<number> {
    const csv = envs.FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS;
    if (csv !== cachedAllowlistCsv) {
        cachedAllowlistCsv = csv;
        cachedAllowlist = new Set();
        for (const part of csv.split(',')) {
            const trimmed = part.trim();
            // Strict digit-only to keep scientific/hex/decimal forms from
            // silently casting to an unintended account id.
            if (/^\d+$/.test(trimmed)) cachedAllowlist.add(Number(trimmed));
        }
    }
    return cachedAllowlist;
}

export function shouldUseClickhouseFor(accountId: number): boolean {
    if (getRolloutAllowlist().has(accountId)) return true;
    const pct = envs.FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE;
    if (pct > 0 && accountId % 100 < pct) return true;
    return false;
}

export function resolveBillingUsageSource(accountId: number, requestedSource: 'clickhouse' | 'orb' | undefined): 'clickhouse' | 'orb' {
    const respected = envs.FLAG_ALLOW_OVERRIDE_GETUSAGE_SERVICE ? requestedSource : undefined;
    return respected ?? (shouldUseClickhouseFor(accountId) ? 'clickhouse' : 'orb');
}

async function resolveEnvironmentNamesInBreakdown(
    usage: BillingUsageMetrics,
    breakdown: { [M in UsageMetric]?: BreakdownDimensions[M] | undefined } | undefined
): Promise<void> {
    const metrics = (Object.keys(breakdown ?? {}) as UsageMetric[]).filter((m) => breakdown?.[m] === 'environment_id');
    if (metrics.length === 0) return;
    const series = metrics.flatMap((m) => usage[m]?.breakdown ?? []).filter((s) => s.group && s.group.value !== 'rest');
    const envIds = series.map((s) => Number(s.group!.value)).filter(Number.isFinite);
    if (envIds.length === 0) return;
    const names = await environmentService.getEnvironmentNamesByIds(envIds);
    for (const s of series) {
        const name = names.get(Number(s.group!.value));
        if (name) s.group!.value = name;
    }
}

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
    getTopDimensionValues(params: GetTopDimensionValuesParams): Promise<Result<GetTopDimensionValuesResult>>;
}

export interface GetTopDimensionValuesParams {
    accountId: number;
    metric: UsageMetric;
    dimension: string;
    timeframe: { start: Date; end: Date };
    limit: number;
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

    public async getBillingUsage(_subscriptionId: string, _accountId: number, _opts?: GetBillingUsageOpts): Promise<Result<BillingUsageMetrics>> {
        return Promise.resolve(Ok({}));
    }

    public async getTopDimensionValues(params: GetTopDimensionValuesParams): Promise<Result<GetTopDimensionValuesResult>> {
        return Promise.resolve(Ok({ accountId: params.accountId, metric: params.metric, dimension: params.dimension, values: [] }));
    }
}

export class UsageTracker implements IUsageTracker {
    private cache: UsageCache;
    private redis: Awaited<ReturnType<typeof getRedis>>;
    public billingClient: UsageBillingClient;
    // Read-only client for the dashboard CH path (gated by
    // FLAG_ALLOW_OVERRIDE_GETUSAGE_SERVICE + per-request `source` override).
    // Lazy-init keeps the dependency out of code paths that never read
    // billing usage from CH.
    private clickhouse: Clickhouse | null = null;

    constructor(redis: Awaited<ReturnType<typeof getRedis>>) {
        this.cache = new UsageCache(redis);
        this.redis = redis;
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

    public async getTopDimensionValues(params: GetTopDimensionValuesParams): Promise<Result<GetTopDimensionValuesResult>> {
        // The (metric, dimension) pair is validated upstream by the controller's
        // zod schema. The CH discriminated union enforces it at compile time,
        // but the narrowing is lost at this public boundary — cast safely.
        return this.getClickhouse().getTopDimensionValues(params as GetTopDimensionValuesQuery);
    }

    public async getBillingUsage(subscriptionId: string, accountId: number, opts?: GetBillingUsageOpts): Promise<Result<BillingUsageMetrics>> {
        const effectiveSource = resolveBillingUsageSource(accountId, opts?.source);
        const useClickhouseForDashboard = effectiveSource === 'clickhouse' && opts?.granularity === 'day' && opts.timeframe?.start && opts.timeframe?.end;

        if (useClickhouseForDashboard) {
            return this.getBillingUsageFromClickhouse(accountId, {
                timeframe: opts.timeframe!,
                ...(opts.metrics ? { metrics: opts.metrics } : {}),
                ...(opts.breakdown ? { breakdown: opts.breakdown } : {}),
                ...(opts.top !== undefined ? { top: opts.top } : {}),
                ...(opts.filter ? { filter: opts.filter } : {})
            });
        }

        // Orb path: strip CH-only fields so they don't pollute the billing
        // client's Redis cache key. Orb itself ignores them, but the cache key
        // hashes the full opts and would miss on otherwise-identical queries.
        const orbOpts: GetBillingUsageOpts | undefined = opts
            ? {
                  ...(opts.timeframe ? { timeframe: opts.timeframe } : {}),
                  ...(opts.granularity ? { granularity: opts.granularity } : {}),
                  ...(opts.billingMetric ? { billingMetric: opts.billingMetric } : {})
              }
            : undefined;
        const billingUsageMetrics = await this.billingClient.getUsage(subscriptionId, orbOpts);
        if (billingUsageMetrics.isErr()) {
            return Err(billingUsageMetrics.error);
        }

        const orbValue = billingUsageMetrics.value.value;
        const formatted: BillingUsageMetrics = {
            ...orbValue,
            connections: orbValue.connections ? toCumulativeUsage(orbValue.connections) : undefined,
            records: orbValue.records ? toCumulativeUsage(orbValue.records) : undefined
        };

        if (!billingUsageMetrics.value.fromCache && shouldShadow(opts)) {
            // Pass raw Orb (pre-`toCumulativeUsage`) so the AVG-metric
            // comparison isn't biased by the formatter's `Math.floor` — both
            // sides are floats, true apples-to-apples.
            void this.shadowAgainstClickhouse({ accountId, timeframe: opts.timeframe, orbResult: orbValue }).catch((err: unknown) => {
                logger.error(`billing-usage shadow failed: ${stringifyError(err)}`);
            });
        }

        if (!billingUsageMetrics.value.fromCache && shouldShadowCapping(opts)) {
            void this.shadowCappingAgainstClickhouse({ accountId, orbResult: orbValue }).catch((err: unknown) => {
                logger.error(`billing-usage capping shadow failed: ${stringifyError(err)}`);
            });
        }

        return Ok(formatted);
    }

    /**
     * Fire CH with the same shape as the just-completed Orb call and emit
     * per-metric divergence telemetry. Wrapped in a 5s timeout so a slow CH
     * query can't pile up requests. Observability-only — never throws.
     */
    private async shadowAgainstClickhouse({
        accountId,
        timeframe,
        orbResult
    }: {
        accountId: number;
        timeframe: { start: Date; end: Date };
        orbResult: BillingUsageMetrics;
    }): Promise<void> {
        const start = process.hrtime.bigint();

        // Shared error reference so we can identify the timeout branch in the
        // outcome tag without string-matching the message.
        const timeoutErr = new Error('shadow_timeout');
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const chResult = await Promise.race<Result<BillingUsageMetrics>>([
            this.getBillingUsageFromClickhouse(accountId, { timeframe, maxExecutionSeconds: SHADOW_CH_MAX_EXECUTION_SECONDS }),
            new Promise((resolve) => {
                timeoutId = setTimeout(() => resolve(Err(timeoutErr)), SHADOW_TIMEOUT_MS);
            })
        ]);
        clearTimeout(timeoutId);

        const outcome = chResult.isOk() ? 'ok' : chResult.error === timeoutErr ? 'timeout' : 'ch_error';
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
        metrics.distribution(metrics.Types.BILLING_USAGE_SHADOW_DURATION_MS, elapsedMs, { outcome });
        if (chResult.isErr()) return;

        // Iterate the complete metric set (not just one side's keys) and
        // coerce `undefined` to 0 — a metric absent from either response is
        // what the customer sees as 0 on the dashboard, so it must count
        // toward the one-sided signal when only one side has data.
        // One-sided emits a separate counter rather than divergence=1.0 so
        // missing-data spikes don't drown out the continuous-divergence p99.
        const allMetrics: UsageMetric[] = [...COUNTER_METRICS, ...AVG_METRICS];
        for (const metric of allMetrics) {
            const orbTotal = orbResult[metric]?.total ?? 0;
            const chTotal = chResult.value[metric]?.total ?? 0;
            if (orbTotal === 0 && chTotal === 0) continue;
            if (orbTotal === 0 || chTotal === 0) {
                const zeroSide = orbTotal === 0 ? 'orb' : 'ch';
                metrics.increment(metrics.Types.BILLING_USAGE_SHADOW_ONE_SIDED, 1, { accountId, metric, zeroSide });
                continue;
            }
            const denom = Math.max(orbTotal, chTotal);
            const divergence = Math.abs(orbTotal - chTotal) / denom;
            const higher = orbTotal === chTotal ? 'equal' : orbTotal > chTotal ? 'orb' : 'ch';
            metrics.distribution(metrics.Types.BILLING_USAGE_SHADOW_DIVERGENCE, divergence, { accountId, metric, higher });
        }
    }

    private async shadowCappingAgainstClickhouse({ accountId, orbResult }: { accountId: number; orbResult: BillingUsageMetrics }): Promise<void> {
        const start = process.hrtime.bigint();
        const timeoutErr = new Error('shadow_timeout');
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const chResult = await Promise.race<Result<BillingUsageMetrics>>([
            this.getClickhouse().getCurrentMonthBillingMetrics(accountId, new Date()),
            new Promise((resolve) => {
                timeoutId = setTimeout(() => resolve(Err(timeoutErr)), SHADOW_TIMEOUT_MS);
            })
        ]);
        clearTimeout(timeoutId);

        const outcome = chResult.isOk() ? 'ok' : chResult.error === timeoutErr ? 'timeout' : 'ch_error';
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
        metrics.distribution(metrics.Types.BILLING_USAGE_CAPPING_SHADOW_DURATION_MS, elapsedMs, { outcome });
        if (chResult.isErr()) return;

        // Populate `billing:usage:ch:<accountId>` so the eventual source flip
        // from Orb to CH doesn't cold-start every account against CH on cutover.
        const cacheKey = `billing:usage:ch:${accountId}`;
        try {
            await this.redis.set(cacheKey, JSON.stringify(chResult.value), { EX: envs.USAGE_BILLING_API_CACHE_TTL_SECONDS });
        } catch (err) {
            logger.warning(`capping shadow CH cache write failed for account=${accountId}: ${stringifyError(err)}`);
        }

        // Capping path covers only COUNTER metrics — connections/records read
        // from Postgres on the capping path and aren't returned by either Orb
        // (no-timeframe scopes to billing period totals, AVG metrics are
        // formatter-only) or the CH primitive here.
        for (const metric of COUNTER_METRICS) {
            const orbTotal = orbResult[metric]?.total ?? 0;
            const chTotal = chResult.value[metric]?.total ?? 0;
            if (orbTotal === 0 && chTotal === 0) continue;
            if (orbTotal === 0 || chTotal === 0) {
                const zeroSide = orbTotal === 0 ? 'orb' : 'ch';
                metrics.increment(metrics.Types.BILLING_USAGE_CAPPING_SHADOW_ONE_SIDED, 1, { accountId, metric, zeroSide });
                continue;
            }
            const denom = Math.max(orbTotal, chTotal);
            const divergence = Math.abs(orbTotal - chTotal) / denom;
            const higher = orbTotal === chTotal ? 'equal' : orbTotal > chTotal ? 'orb' : 'ch';
            metrics.distribution(metrics.Types.BILLING_USAGE_CAPPING_SHADOW_DIVERGENCE, divergence, { accountId, metric, higher });
        }
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
            breakdown?: { [M in UsageMetric]?: BreakdownDimensions[M] | undefined };
            top?: number;
            // Override CH `max_execution_time` for every fan-out query. The
            // shadow path uses this so an abandoned race doesn't keep CH busy.
            maxExecutionSeconds?: number;
            // Per-metric row-level filter. Mutually exclusive with `breakdown`
            // on the same metric — the controller rejects the combination
            // before reaching this method.
            filter?: { [M in UsageMetric]?: { dimension: BreakdownDimensions[M]; value: string } | undefined };
        }
    ): Promise<Result<BillingUsageMetrics>> {
        const { timeframe, metrics: scopedMetrics, breakdown, top, maxExecutionSeconds, filter } = opts;
        const scope = scopedMetrics ? new Set(scopedMetrics) : null;
        const inScope = (m: UsageMetric): boolean => !scope || scope.has(m);
        const counterMetrics: CounterUsageMetric[] = COUNTER_METRICS.filter(inScope);
        const avgMetrics: AvgUsageMetric[] = AVG_METRICS.filter(inScope);
        const counterNoDim = counterMetrics.filter((m) => !breakdown?.[m]);
        const avgNoDim = avgMetrics.filter((m) => !breakdown?.[m]);
        const ch = this.getClickhouse();

        const maxExecOpt = maxExecutionSeconds !== undefined ? { maxExecutionSeconds } : {};
        // `filter[m]` is the per-metric filter typed as
        // `{ dimension: BreakdownDimensions[m]; value: string } | undefined`.
        // TypeScript can't narrow the union when `m` is a generic counter
        // metric, so we cast at the call site — the value is validated by
        // the controller's discriminated zod schema before we get here.
        const filterFor = <M extends UsageMetric>(m: M): { dimension: BreakdownDimensions[M]; value: string } | undefined =>
            filter?.[m] as { dimension: BreakdownDimensions[M]; value: string } | undefined;

        // Base calls — `dimension: 'none'` is valid for every variant.
        // Filter forces a cast to the discriminated union because TS can't
        // narrow `BreakdownDimensions[M]` while iterating a union-typed `m`;
        // safe because controller-side zod validates the (metric, dim) pair.
        const counterBaseP = Promise.all(
            counterNoDim.map((m) => {
                const f = filterFor(m);
                return ch
                    .getDailyCounter({ accountId, metric: m, dimension: 'none', timeframe, ...(f ? { filter: f } : {}), ...maxExecOpt } as GetDailyCounterQuery)
                    .then((r) => [m, r] as const);
            })
        );
        const avgBaseP = Promise.all(
            avgNoDim.map((m) => {
                const f = filterFor(m);
                return ch
                    .getDailySumAndBatches({
                        accountId,
                        metric: m,
                        dimension: 'none',
                        timeframe,
                        ...(f ? { filter: f } : {}),
                        ...maxExecOpt
                    } as GetDailySumAndBatchesQuery)
                    .then((r) => [m, r] as const);
            })
        );

        // Breakdown calls — unrolled per-metric so `metric: '<literal>'` picks
        // the right `GetDailyCounterQuery` variant and `dimension: breakdown.<m>`
        // is typed as `BreakdownDimensions[<m>]`. No cast needed.
        const topOpt = top !== undefined ? { top } : {};
        const counterBreakdownCalls = [
            inScope('proxy') && breakdown?.proxy
                ? ch
                      .getDailyCounter({ accountId, metric: 'proxy', dimension: breakdown.proxy, timeframe, ...topOpt, ...maxExecOpt })
                      .then((r) => ['proxy' as const, r] as const)
                : null,
            inScope('function_executions') && breakdown?.function_executions
                ? ch
                      .getDailyCounter({
                          accountId,
                          metric: 'function_executions',
                          dimension: breakdown.function_executions,
                          timeframe,
                          ...topOpt,
                          ...maxExecOpt
                      })
                      .then((r) => ['function_executions' as const, r] as const)
                : null,
            inScope('function_logs') && breakdown?.function_logs
                ? ch
                      .getDailyCounter({ accountId, metric: 'function_logs', dimension: breakdown.function_logs, timeframe, ...topOpt, ...maxExecOpt })
                      .then((r) => ['function_logs' as const, r] as const)
                : null,
            inScope('function_compute_gbms') && breakdown?.function_compute_gbms
                ? ch
                      .getDailyCounter({
                          accountId,
                          metric: 'function_compute_gbms',
                          dimension: breakdown.function_compute_gbms,
                          timeframe,
                          ...topOpt,
                          ...maxExecOpt
                      })
                      .then((r) => ['function_compute_gbms' as const, r] as const)
                : null,
            inScope('webhook_forwards') && breakdown?.webhook_forwards
                ? ch
                      .getDailyCounter({ accountId, metric: 'webhook_forwards', dimension: breakdown.webhook_forwards, timeframe, ...topOpt, ...maxExecOpt })
                      .then((r) => ['webhook_forwards' as const, r] as const)
                : null
        ].filter((p): p is NonNullable<typeof p> => p !== null);
        const counterBreakdownP = Promise.all(counterBreakdownCalls);

        const avgBreakdownCalls = [
            inScope('records') && breakdown?.records
                ? ch
                      .getDailySumAndBatches({ accountId, metric: 'records', dimension: breakdown.records, timeframe, ...topOpt, ...maxExecOpt })
                      .then((r) => ['records' as const, r] as const)
                : null,
            inScope('connections') && breakdown?.connections
                ? ch
                      .getDailySumAndBatches({ accountId, metric: 'connections', dimension: breakdown.connections, timeframe, ...topOpt, ...maxExecOpt })
                      .then((r) => ['connections' as const, r] as const)
                : null
        ].filter((p): p is NonNullable<typeof p> => p !== null);
        const avgBreakdownP = Promise.all(avgBreakdownCalls);

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
            // Empty series (filter matched no rows, or no events in window):
            // emit a zero-valued cumulative metric so the downstream API
            // formatter doesn't fall back to its generic `view_mode: 'periodic'`
            // shape, which is wrong for AVG metrics.
            result[metric] = toRunningAvgUsage(res.value)[0] ?? { externalId: metric, total: 0, usage: [], view_mode: 'cumulative' };
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
        await resolveEnvironmentNamesInBreakdown(result, breakdown);
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
        // Ship the float — Orb returns floats too (e.g. 583418434.4342688).
        // Rounding here crushes low-volume breakdown series to 0 (e.g. 1
        // record split across 3 dims renders as 0, 0, 0). Presentation
        // layer decides how to format.
        usage.push({
            timeframeStart: day.day,
            timeframeEnd: addOneDay(day.day),
            quantity: runningSum / runningBatches
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
        if ('isRest' in series) {
            base.group = { key: series.dimension, value: 'rest' };
            base.isRest = true;
        } else {
            base.group = { key: series.dimension, value: String(series.dimensionValue) };
        }
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
            if ('isRest' in series) {
                out.group = { key: series.dimension, value: 'rest' };
                out.isRest = true;
            } else {
                out.group = { key: series.dimension, value: String(series.dimensionValue) };
            }
        }
        return out;
    });
}
