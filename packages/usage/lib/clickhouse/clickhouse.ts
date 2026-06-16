import { ENVS, Err, Ok, metrics, parseEnvs, stringifyError } from '@nangohq/utils';

import { Batcher } from './batcher.js';
import {
    COUNTER_METRICS,
    FILTER_PARAM_TYPE_FOR_DIM,
    TOP_N_BREAKDOWN_CAP,
    TOP_N_BREAKDOWN_DEFAULT,
    isAllowedDimensionFor,
    quantityForMetric,
    rankingQuantityForMetric,
    tableForMetric
} from './clickhouse.query.js';
import { clickhouseClient, database as usageDatabase } from './config.js';
import { logger } from '../logger.js';

import type {
    GetDailyCounterDay,
    GetDailyCounterQuery,
    GetDailyCounterResult,
    GetDailyCounterSeries,
    GetDailySumAndBatchesDay,
    GetDailySumAndBatchesQuery,
    GetDailySumAndBatchesResult,
    GetDailySumAndBatchesSeries,
    GetTopDimensionValuesQuery,
    GetTopDimensionValuesResult
} from './clickhouse.query.js';
import type {
    BillingUsageMetrics,
    UsageActionsEvent,
    UsageConnectionsEvent,
    UsageEvent,
    UsageFunctionExecutionsEvent,
    UsageRecordsEvent
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const envs = parseEnvs(ENVS);

// Ceiling for dashboard read queries (getDailyCounter / getDailySumAndBatches).
// Sub-second p95 is expected; this caps any pathological query (huge timeframe
// × high-cardinality breakdown) instead of letting it hang the request.
const READ_QUERY_MAX_EXECUTION_SECONDS = 30;

// Exclude accountId, which is already a top-level column, and environmentName which is not needed for usage metrics
type UsageAttrs<E extends { payload: { properties: object } }, K extends string = never> = Omit<
    E['payload']['properties'],
    'accountId' | 'environmentName' | K
>;

type ClickhouseRawUsageEventAttrs =
    | UsageAttrs<UsageFunctionExecutionsEvent>
    | UsageAttrs<UsageConnectionsEvent, 'connectionId'>
    | UsageAttrs<UsageActionsEvent>
    | UsageAttrs<UsageEvent>
    | UsageAttrs<UsageRecordsEvent, 'syncId'>;

export interface ClickhouseRawUsageEvent {
    ts: number; // Unix timestamp in milliseconds, matches DateTime64(3)
    idempotency_key: UsageEvent['idempotencyKey'];
    type: UsageEvent['type'];
    value: UsageEvent['payload']['value'];
    account_id: UsageEvent['payload']['properties']['accountId'];
    attributes: ClickhouseRawUsageEventAttrs;
}

export class Clickhouse {
    private batcher: Batcher<ClickhouseRawUsageEvent> | null = null;
    private client: ReturnType<typeof clickhouseClient> = null;

    public database: string;

    constructor({ database }: { database: string } = { database: usageDatabase }) {
        this.database = database;
        const client = clickhouseClient({ database });
        if (!client) {
            return;
        }

        this.client = client;
        this.batcher = new Batcher({
            process: async (events, { retryKey }) => {
                try {
                    await client.insert({
                        table: 'raw_events',
                        values: events,
                        format: 'JSONEachRow',
                        // Token is stable across retries of the same logical batch, so CH
                        // server-side dedup catches a retried INSERT even if the block
                        // content has drifted. Paired with the cluster-wide settings in
                        // config.ts, this propagates the dedup decision to all dependent MVs.
                        clickhouse_settings: { insert_deduplication_token: retryKey }
                    });
                } catch (err) {
                    logger.error(`Failed to insert usage events into Clickhouse: ${stringifyError(err)}`);
                    throw err;
                }
            },
            maxBatchSize: envs.CLICKHOUSE_USAGE_INGEST_BATCH_SIZE,
            flushIntervalMs: envs.CLICKHOUSE_USAGE_INGEST_BATCH_INTERVAL_MS,
            maxQueueSize: envs.CLICKHOUSE_USAGE_INGEST_MAX_QUEUE_SIZE
        });
    }

    add(events: UsageEvent[]): Result<void> {
        if (!this.batcher) {
            return Ok(undefined);
        }
        const raws = events.flatMap((event) => {
            const raw = toRaw(event);
            return raw ? [raw] : [];
        });
        return this.batcher.add(...raws);
    }

    addRaw(events: ClickhouseRawUsageEvent[]): Result<void> {
        if (!this.batcher) {
            return Ok(undefined);
        }
        return this.batcher.add(...events);
    }

    flush(): Promise<Result<void>> {
        return this.batcher ? this.batcher.flush() : Promise.resolve(Ok(undefined));
    }

    // Per-day `value` series for a single counter metric. Dimension breakdown
    // is top-N + 'rest' bounded; with `dimension === 'none'` the SQL returns
    // one series.
    async getDailyCounter(query: GetDailyCounterQuery): Promise<Result<GetDailyCounterResult>> {
        if (!this.client) {
            return Err(new Error('Clickhouse client not initialized'));
        }

        const { accountId, metric, dimension, timeframe, maxExecutionSeconds, filter } = query;
        if (!isAllowedDimensionFor(metric, dimension)) {
            return Err(new Error(`Invalid dimension ${JSON.stringify(dimension)} for metric ${JSON.stringify(metric)}`));
        }
        if (filter && !isAllowedDimensionFor(metric, filter.dimension)) {
            return Err(new Error(`Invalid filter dimension ${JSON.stringify(filter.dimension)} for metric ${JSON.stringify(metric)}`));
        }
        const queryStart = process.hrtime.bigint();
        const tags = { metric, breakdown: dimension !== 'none' ? 'true' : 'false' };
        const startDate = timeframe.start.toISOString().split('T')[0];
        const endDate = timeframe.end.toISOString().split('T')[0];
        const table = `${this.database}.${tableForMetric(metric)}`;
        const top = Math.min(query.top ?? TOP_N_BREAKDOWN_DEFAULT, TOP_N_BREAKDOWN_CAP);
        // `query_params` keeps the user-supplied filter value out of the SQL
        // string — CH parses, validates, and binds it server-side. Native
        // column type per dim (Int64/Bool/String) so comparison stays native
        // and any column-level data-skipping index applies.
        const filterParamType = filter ? (FILTER_PARAM_TYPE_FOR_DIM[filter.dimension] ?? 'String') : null;
        const filterClause = filter ? `AND ${filter.dimension} = {filter_value:${filterParamType}}` : '';
        const queryParams = filter ? { filter_value: filter.value } : undefined;

        const sql =
            dimension === 'none'
                ? `
            SELECT
                day,
                ${quantityForMetric(metric)} AS value
            FROM ${table}
            WHERE account_id = ${accountId}
              AND day >= toDate('${startDate}')
              AND day < toDate('${endDate}')
              ${filterClause}
            GROUP BY day
            ORDER BY day
        `
                : `
            WITH top_dims AS (
                SELECT ${dimension} AS dim, ${quantityForMetric(metric)} AS total
                FROM ${table}
                WHERE account_id = ${accountId}
                  AND day >= toDate('${startDate}')
                  AND day < toDate('${endDate}')
                  ${filterClause}
                GROUP BY ${dimension}
                ORDER BY total DESC
                LIMIT ${top}
            )
            SELECT
                day,
                IF(${dimension} IN (SELECT dim FROM top_dims), toString(${dimension}), '') AS dimensionValue,
                IF(${dimension} IN (SELECT dim FROM top_dims), 0, 1) AS isRest,
                ${quantityForMetric(metric)} AS value
            FROM ${table}
            WHERE account_id = ${accountId}
              AND day >= toDate('${startDate}')
              AND day < toDate('${endDate}')
              ${filterClause}
            GROUP BY day, isRest, dimensionValue
            ORDER BY day, isRest, dimensionValue
        `;

        try {
            const res = await this.client.query({
                query: sql,
                format: 'JSONEachRow',
                ...(queryParams ? { query_params: queryParams } : {}),
                clickhouse_settings: { max_execution_time: maxExecutionSeconds ?? READ_QUERY_MAX_EXECUTION_SECONDS }
            });
            const rows = await res.json<{
                day: string;
                value: string | number;
                dimensionValue?: string;
                isRest?: 0 | 1;
            }>();

            const seriesMap = new Map<string, GetDailyCounterSeries>();
            for (const row of rows) {
                const dayPoint: GetDailyCounterDay = {
                    day: new Date(row.day),
                    value: Number(row.value)
                };
                if (dimension !== 'none') {
                    // `isRest` is the authoritative rollup marker — comparing
                    // `dimensionValue === 'rest'` is unsafe because user
                    // strings (connection_id, model, etc.) can literally be
                    // 'rest' and we'd merge real and rollup into one bucket.
                    const isRest = row.isRest === 1;
                    // Composite key keeps the rollup bucket isolated from any
                    // real dim value that happens to be the same string.
                    const key = isRest ? '\x00rest' : `\x01${String(row.dimensionValue)}`;
                    let entry = seriesMap.get(key);
                    if (!entry) {
                        entry = isRest
                            ? { dimension, isRest: true, days: [] }
                            : { dimension, dimensionValue: coerceDimensionValue(row.dimensionValue ?? '', dimension), days: [] };
                        seriesMap.set(key, entry);
                    }
                    entry.days.push(dayPoint);
                } else {
                    let entry = seriesMap.get('');
                    if (!entry) {
                        entry = { days: [] };
                        seriesMap.set('', entry);
                    }
                    entry.days.push(dayPoint);
                }
            }

            const series = Array.from(seriesMap.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([, value]) => value);

            metrics.distribution(metrics.Types.BILLING_USAGE_CLICKHOUSE_QUERY_DURATION_MS, Number(process.hrtime.bigint() - queryStart) / 1e6, {
                ...tags,
                success: 'true'
            });
            return Ok({ accountId, metric, series });
        } catch (err) {
            metrics.distribution(metrics.Types.BILLING_USAGE_CLICKHOUSE_QUERY_DURATION_MS, Number(process.hrtime.bigint() - queryStart) / 1e6, {
                ...tags,
                success: 'false'
            });
            logger.error(`Clickhouse getDailyCounter failed for account=${accountId} metric=${metric} dimension=${dimension}: ${stringifyError(err)}`);
            return Err(new Error('Failed to execute Clickhouse daily counter query', { cause: err }));
        }
    }

    /**
     * Per-day `(sum, batches)` accumulators for `records` / `connections` —
     * the two metrics whose write path tags each metering-cron firing with a
     * `batch_id` column. Both numbers are needed because the dashboard's
     * `view_mode='cumulative'` series is the running PERIOD average across all
     * batches in the period:
     *
     *     running_avg(D) = SUM(value)[start..D] / uniqExact(batch_id)[start..D]
     *
     * Per-day averages alone don't recombine when batch counts differ:
     *
     *     day 0:  10 batches × 100 each  →  sum=1000, batches=10
     *     day 1:   2 batches × 1000 each →  sum=2000, batches= 2
     *
     *     truth after day 1 = (10·100 + 2·1000) / 12     = 250
     *     accumulators:       (1000 + 2000) / (10 + 2)   = 250 ✓
     *     avg-of-daily-avgs:  (100 + 1000) / 2           = 550 ✗
     *
     * `batches` is `uniqExact(batch_id)`, NOT row count (one batch produces
     * multiple rows, one per slice). For the dimension breakdown, `batches`
     * is the GLOBAL per-day count (joined via the `global_batches` CTE) so
     * every series shares the same denominator and per-dim running averages
     * stay additive to the no-dim global — the breakdown decomposes the bill
     * total rather than being a "size when active" view.
     *
     * Additive-to-global requires that an inactive dim still advance its
     * denominator on every global day, otherwise its running-avg stays
     * inflated after it stops contributing. The SQL emits sparse rows; we
     * zero-fill `(day, dim)` post-query so every dim series shares the same
     * day-set with `sum=0` on inactive days and `batches=global(day)`.
     */
    async getDailySumAndBatches(query: GetDailySumAndBatchesQuery): Promise<Result<GetDailySumAndBatchesResult>> {
        if (!this.client) {
            return Err(new Error('Clickhouse client not initialized'));
        }
        const { accountId, metric, dimension, timeframe, maxExecutionSeconds, filter } = query;
        if (!isAllowedDimensionFor(metric, dimension)) {
            return Err(new Error(`Invalid dimension ${JSON.stringify(dimension)} for metric ${JSON.stringify(metric)}`));
        }
        if (filter && !isAllowedDimensionFor(metric, filter.dimension)) {
            return Err(new Error(`Invalid filter dimension ${JSON.stringify(filter.dimension)} for metric ${JSON.stringify(metric)}`));
        }
        const queryStart = process.hrtime.bigint();
        const tags = { metric, breakdown: dimension !== 'none' ? 'true' : 'false' };
        const startDate = timeframe.start.toISOString().split('T')[0];
        const endDate = timeframe.end.toISOString().split('T')[0];
        const table = `${this.database}.${tableForMetric(metric)}`;
        const top = Math.min(query.top ?? TOP_N_BREAKDOWN_DEFAULT, TOP_N_BREAKDOWN_CAP);
        // `query_params` keeps the user-supplied filter value out of the SQL
        // string. Filter narrows both `SUM(value)` and `uniqExact(batch_id)`
        // so the running average reflects only the filtered subset.
        // See `getDailyCounter` for the typed-binding rationale.
        const filterParamType = filter ? (FILTER_PARAM_TYPE_FOR_DIM[filter.dimension] ?? 'String') : null;
        const filterClauseAliased = filter ? `AND t.${filter.dimension} = {filter_value:${filterParamType}}` : '';
        const filterClause = filter ? `AND ${filter.dimension} = {filter_value:${filterParamType}}` : '';
        const queryParams = filter ? { filter_value: filter.value } : undefined;

        // dim branch JOINs per-dim sums against `global_batches` so every series
        // shares the same denominator — see method docstring.
        const sql =
            dimension === 'none'
                ? `
            SELECT
                day AS day,
                SUM(value) AS sum,
                uniqExact(batch_id) AS batches
            FROM ${table}
            WHERE account_id = ${accountId}
            AND day >= toDate('${startDate}')
            AND day < toDate('${endDate}')
            ${filterClause}
            GROUP BY day
            ORDER BY day
        `
                : `
            WITH global_batches AS (
                SELECT day, uniqExact(batch_id) AS batches
                FROM ${table}
                WHERE account_id = ${accountId}
                AND day >= toDate('${startDate}')
                AND day < toDate('${endDate}')
                ${filterClause}
                GROUP BY day
            ),
            top_dims AS (
                SELECT ${dimension} AS dim, SUM(value) AS total
                FROM ${table}
                WHERE account_id = ${accountId}
                AND day >= toDate('${startDate}')
                AND day < toDate('${endDate}')
                ${filterClause}
                GROUP BY ${dimension}
                ORDER BY total DESC
                LIMIT ${top}
            )
            SELECT
                t.day AS day,
                SUM(t.value) AS sum,
                -- g.batches is the global per-day batch count (same for every
                -- row joined on a given day), so any()/min()/max() all return
                -- the same value; any() is the cheapest aggregator in CH.
                any(g.batches) AS batches,
                IF(t.${dimension} IN (SELECT dim FROM top_dims), toString(t.${dimension}), '') AS dimensionValue,
                IF(t.${dimension} IN (SELECT dim FROM top_dims), 0, 1) AS isRest
            FROM ${table} t
            INNER JOIN global_batches g ON g.day = t.day
            WHERE t.account_id = ${accountId}
            AND t.day >= toDate('${startDate}')
            AND t.day < toDate('${endDate}')
            ${filterClauseAliased}
            GROUP BY t.day, isRest, dimensionValue
            ORDER BY t.day, isRest, dimensionValue
        `;

        try {
            const res = await this.client.query({
                query: sql,
                format: 'JSONEachRow',
                ...(queryParams ? { query_params: queryParams } : {}),
                clickhouse_settings: { max_execution_time: maxExecutionSeconds ?? READ_QUERY_MAX_EXECUTION_SECONDS }
            });
            const rows = await res.json<{
                day: string;
                sum: string | number;
                batches: string | number;
                dimensionValue?: string;
                isRest?: 0 | 1;
            }>();

            // One series per distinct dimensionValue; preserve insertion order for stability.
            const seriesMap = new Map<string, GetDailySumAndBatchesSeries>();
            for (const row of rows) {
                const dayPoint: GetDailySumAndBatchesDay = {
                    day: new Date(row.day),
                    sum: Number(row.sum),
                    batches: Number(row.batches)
                };
                if (dimension !== 'none') {
                    // `isRest` is the authoritative rollup marker — see
                    // getDailyCounter for the collision rationale.
                    const isRest = row.isRest === 1;
                    // Composite key keeps the rollup bucket isolated from any
                    // real dim value that happens to be the same string.
                    const key = isRest ? '\x00rest' : `\x01${String(row.dimensionValue)}`;
                    let entry = seriesMap.get(key);
                    if (!entry) {
                        entry = isRest
                            ? { dimension, isRest: true, days: [] }
                            : { dimension, dimensionValue: coerceDimensionValue(row.dimensionValue ?? '', dimension), days: [] };
                        seriesMap.set(key, entry);
                    }
                    entry.days.push(dayPoint);
                } else {
                    let entry = seriesMap.get('');
                    if (!entry) {
                        entry = { days: [] };
                        seriesMap.set('', entry);
                    }
                    entry.days.push(dayPoint);
                }
            }

            // Zero-fill inactive (day, dim) pairs so per-dim running averages
            // stay additive to the no-dim global — see method docstring. SQL
            // emits sparse rows; we materialize the full grid here so every
            // dim series shares the same day-set with `sum=0` where missing
            // and `batches=global(day)` carried from any dim that saw it.
            if (dimension !== 'none' && seriesMap.size > 0) {
                const globalBatches = new Map<number, number>();
                for (const entry of seriesMap.values()) {
                    for (const d of entry.days) {
                        globalBatches.set(d.day.getTime(), d.batches);
                    }
                }
                const orderedDays = Array.from(globalBatches.entries()).sort(([a], [b]) => a - b);
                for (const entry of seriesMap.values()) {
                    const sumByDay = new Map<number, number>();
                    for (const d of entry.days) sumByDay.set(d.day.getTime(), d.sum);
                    entry.days = orderedDays.map(([dayMs, batches]) => ({
                        day: new Date(dayMs),
                        sum: sumByDay.get(dayMs) ?? 0,
                        batches
                    }));
                }
            }

            const series = Array.from(seriesMap.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([, value]) => value);

            metrics.distribution(metrics.Types.BILLING_USAGE_CLICKHOUSE_QUERY_DURATION_MS, Number(process.hrtime.bigint() - queryStart) / 1e6, {
                ...tags,
                success: 'true'
            });
            return Ok({ accountId, metric, series });
        } catch (err) {
            metrics.distribution(metrics.Types.BILLING_USAGE_CLICKHOUSE_QUERY_DURATION_MS, Number(process.hrtime.bigint() - queryStart) / 1e6, {
                ...tags,
                success: 'false'
            });
            logger.error(`Clickhouse getDailySumAndBatches failed for account=${accountId} metric=${metric} dimension=${dimension}: ${stringifyError(err)}`);
            return Err(new Error('Failed to execute Clickhouse daily sum+batches query', { cause: err }));
        }
    }

    /**
     * Top-N seen dimension values for (metric, dimension) over a timeframe,
     * ordered DESC by `rankingQuantityForMetric(metric)`. Populates the
     * filter dropdown UI. Limit is clamped to `TOP_N_BREAKDOWN_CAP`.
     */
    async getTopDimensionValues(query: GetTopDimensionValuesQuery): Promise<Result<GetTopDimensionValuesResult>> {
        if (!this.client) {
            return Err(new Error('Clickhouse client not initialized'));
        }

        const { accountId, metric, dimension, timeframe, limit } = query;
        // `isAllowedDimensionFor` accepts 'none' (valid for breakdown callers,
        // not for top-values — would emit `SELECT toString(none)`). The cast
        // defends against runtime callers bypassing the discriminated-union
        // param type with `as any`.
        if ((dimension as string) === 'none' || !isAllowedDimensionFor(metric, dimension)) {
            return Err(new Error(`Invalid dimension ${JSON.stringify(dimension)} for metric ${JSON.stringify(metric)}`));
        }
        const queryStart = process.hrtime.bigint();
        const tags = { metric };
        const startDate = timeframe.start.toISOString().split('T')[0];
        const endDate = timeframe.end.toISOString().split('T')[0];
        const table = `${this.database}.${tableForMetric(metric)}`;
        const cappedLimit = Math.min(Math.max(limit, 1), TOP_N_BREAKDOWN_CAP);

        // The output alias is `dim` (not `value`) so the `ORDER BY` reference
        // to the table column `value` (used by `rankingQuantityForMetric`) is
        // not shadowed by the projection.
        const sql = `
            SELECT toString(${dimension}) AS dim
            FROM ${table}
            WHERE account_id = ${accountId}
              AND day >= toDate('${startDate}')
              AND day < toDate('${endDate}')
            GROUP BY ${dimension}
            ORDER BY ${rankingQuantityForMetric(metric)} DESC
            LIMIT ${cappedLimit}
        `;

        try {
            const res = await this.client.query({
                query: sql,
                format: 'JSONEachRow',
                clickhouse_settings: { max_execution_time: READ_QUERY_MAX_EXECUTION_SECONDS }
            });
            const rows = await res.json<{ dim: string }>();
            metrics.distribution(metrics.Types.BILLING_USAGE_CLICKHOUSE_TOP_DIMENSION_VALUES_DURATION_MS, Number(process.hrtime.bigint() - queryStart) / 1e6, {
                ...tags,
                success: 'true'
            });
            return Ok({ accountId, metric, dimension, values: rows.map((r) => r.dim) });
        } catch (err) {
            metrics.distribution(metrics.Types.BILLING_USAGE_CLICKHOUSE_TOP_DIMENSION_VALUES_DURATION_MS, Number(process.hrtime.bigint() - queryStart) / 1e6, {
                ...tags,
                success: 'false'
            });
            logger.error(`Clickhouse getTopDimensionValues failed for account=${accountId} metric=${metric} dimension=${dimension}: ${stringifyError(err)}`);
            return Err(new Error('Failed to execute Clickhouse top-dimension-values query', { cause: err }));
        }
    }

    // CH-backed equivalent of `UsageBillingClient.getUsage(subscriptionId)` (no
    // timeframe) — month-to-date COUNTER totals scoped to the calendar month
    // containing `now`. Returned shape mirrors what Orb returns so the two are
    // swappable at the caller. `records` / `connections` are not included;
    // capping reads those from Postgres.
    //
    // Returns all five COUNTER billing metrics in one call (matches Orb's
    // shape). One revalidate amortises the cache refresh across every billing
    // metric — keep this fanned-out even though the trigger is per-metric.
    async getCurrentMonthBillingMetrics(accountId: number, now: Date, opts?: { maxExecutionSeconds?: number }): Promise<Result<BillingUsageMetrics>> {
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        const timeframe = { start: monthStart, end: nextMonth };
        const maxExecOpt = opts?.maxExecutionSeconds !== undefined ? { maxExecutionSeconds: opts.maxExecutionSeconds } : {};

        const results = await Promise.all(
            COUNTER_METRICS.map((metric) =>
                this.getDailyCounter({ accountId, metric, dimension: 'none', timeframe, ...maxExecOpt } as GetDailyCounterQuery).then(
                    (r) => [metric, r] as const
                )
            )
        );

        const usage: BillingUsageMetrics = {};
        for (const [metric, res] of results) {
            if (res.isErr()) return Err(res.error);
            // Empty series → account has no events for this metric in the
            // window (new account, paused, or partially active). Emit total: 0
            // — capping needs an explicit zero, and skipping the entry would
            // leave a stale cache value untouched.
            const days = res.value.series[0]?.days ?? [];
            const total = days.reduce((acc, d) => acc + d.value, 0);
            usage[metric] = { externalId: metric, total, usage: [], view_mode: 'periodic' };
        }
        return Ok(usage);
    }

    async shutdown(opts?: { timeoutMs: number }): Promise<Result<void>> {
        const res = this.batcher ? await this.batcher.shutdown(opts) : Ok(undefined);

        try {
            await this.client?.close();
        } catch (err) {
            return Err(new Error('Failed to close Clickhouse client', { cause: err }));
        }

        return res;
    }
}

// Coerces the raw string value returned by ClickHouse (forced to String by the
// `toString` inside the top-N IF) back to the typed value expected by the
// breakdown series. The rollup row is detected via the separate `isRest`
// column upstream and never reaches this function.
//
// Only `success` needs typed coercion (boolean). String dims (model,
// function_type, function_name, integration_id, connection_id) round-trip
// through `toString` unchanged. Numeric dims (environment_id) are returned as
// their string form on purpose — the dashboard renders dim values as strings,
// so keeping "123" avoids a round-trip parse on the read side.
function coerceDimensionValue(raw: string, dimension: string): string | number | boolean {
    if (dimension === 'success') {
        return raw === 'true';
    }
    return raw;
}

function toRaw(event: UsageEvent): ClickhouseRawUsageEvent | null {
    switch (event.type) {
        case 'usage.monthly_active_records':
        case 'usage.actions':
        case 'usage.function_executions':
        case 'usage.proxy':
        case 'usage.webhook_forward': {
            const { accountId, ...properties } = event.payload.properties;
            return {
                ts: event.createdAt.getTime(),
                idempotency_key: event.idempotencyKey,
                type: event.type,
                account_id: accountId,
                value: event.payload.value,
                attributes: properties
            };
        }
        case 'usage.records':
        case 'usage.connections':
            // Not ingested into Clickhouse via events
            return null;
    }
}
