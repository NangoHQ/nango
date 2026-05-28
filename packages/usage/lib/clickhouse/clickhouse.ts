import { ENVS, Err, Ok, parseEnvs, stringifyError } from '@nangohq/utils';

import { Batcher } from './batcher.js';
import { granularityGroupBy, granularityOrderBy, quantityForMetric, startSelect, tableForMetric } from './clickhouse.query.js';
import { clickhouseClient, database as usageDatabase } from './config.js';
import { logger } from '../logger.js';

import type {
    CounterUsageMetric,
    GetDailySumAndBatchesDay,
    GetDailySumAndBatchesQuery,
    GetDailySumAndBatchesResult,
    GetDailySumAndBatchesSeries,
    GetUsageQuery,
    GetUsageResult,
    GetUsageResultSeries
} from './clickhouse.query.js';
import type { UsageActionsEvent, UsageConnectionsEvent, UsageEvent, UsageFunctionExecutionsEvent, UsageRecordsEvent } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const envs = parseEnvs(ENVS);

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

    /**
     * Counter metrics only — `proxy`, `function_executions`, `function_logs`,
     * `function_compute_gbms`, `webhook_forwards`. AVG-style metrics (`records`,
     * `connections`) are served by `getDailySumAndBatches` and are excluded from
     * `GetUsageQuery.metrics` at the type level, so the switch below doesn't
     * need to handle them.
     */
    async getUsage(query: GetUsageQuery): Promise<Result<GetUsageResult>> {
        if (!this.client) {
            return Err(new Error('Clickhouse client not initialized'));
        }

        try {
            const qs = (Object.keys(query.metrics) as CounterUsageMetric[]).map(async (metric) => {
                const dimension = query.metrics[metric]?.dimension || 'none';
                const dimensionColumn = dimension === 'none' ? "'none'" : dimension; // quoted 'none' to be used directly in SQL queries as a string literal when no dimension is needed
                const dimensionSelect = `, ${dimensionColumn}`;
                const dimensionGroupBy = dimensionColumn ? `, ${dimensionColumn}` : '';
                const dimensionOrderBy = dimensionColumn ? `, ${dimensionColumn}` : '';
                const sql = `
                    SELECT
                        ${quantityForMetric(metric)} AS quantity,
                        ${startSelect(query)}
                        ${dimensionSelect} AS dimension
                    FROM ${this.database}.${tableForMetric(metric)}
                    WHERE account_id = ${query.accountId}
                    AND day >= toDate('${query.timeframe.start.toISOString().split('T')[0]}')
                    AND day < toDate('${query.timeframe.end.toISOString().split('T')[0]}')
                    GROUP BY account_id ${granularityGroupBy(query)} ${dimensionGroupBy}
                    ORDER BY account_id ${granularityOrderBy(query)} ${dimensionOrderBy}
                `;
                const res = await this.client?.query({ query: sql, format: 'JSONEachRow' });
                return {
                    accountId: query.accountId,
                    metric,
                    dimension,
                    rows: (await res?.json()) as {
                        quantity: number;
                        start: string;
                        end: string;
                        dimension: string;
                    }[]
                };
            });
            const results = await Promise.allSettled(qs);
            const usage: GetUsageResult = {
                accountId: query.accountId,
                granularity: query.granularity,
                metrics: {}
            };
            for (const [i, entry] of results.entries()) {
                if (entry.status === 'fulfilled') {
                    if (!entry.value) continue;
                    const { metric, dimension, rows } = entry.value;
                    const seriesMap: Record<string, GetUsageResultSeries> = {};
                    for (const row of rows) {
                        const dimensionValue = row.dimension;
                        if (!seriesMap[dimensionValue]) {
                            seriesMap[dimensionValue] =
                                dimension !== 'none' ? { dimension, dimensionValue: dimensionValue, total: 0, dataPoints: [] } : { total: 0, dataPoints: [] };
                        }
                        seriesMap[dimensionValue].total += row.quantity;
                        seriesMap[dimensionValue].dataPoints.push({
                            timeframe: {
                                start: new Date(row.start),
                                end: new Date(row.end)
                            },
                            quantity: row.quantity
                        });
                    }

                    // sort series by dimension value for consistent ordering
                    const series = Object.entries(seriesMap)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([, value]) => value);

                    const total = rows.reduce((sum, row) => sum + row.quantity, 0);

                    usage.metrics[metric] = {
                        series,
                        total,
                        view_mode: 'periodic'
                    };
                } else {
                    logger.error(`Failed to execute Clickhouse query for metric ${Object.keys(query.metrics)[i]}: ${stringifyError(entry.reason)}`);
                }
            }
            return Ok(usage);
        } catch (err) {
            return Err(new Error('Failed to execute Clickhouse query', { cause: err }));
        }
    }

    /**
     * Per-day `(sum, batches)` over `daily_raw_records` / `daily_raw_connections`
     * for AVG-style metrics. Only `records` and `connections` use this method —
     * they're the two billable metrics whose write path tags each metering-cron
     * firing with a `batch_id` column. The query type constrains `metric` to
     * that pair at compile time.
     *
     * One series per dimension value (or a single series when
     * `dimension === 'none'`), one entry per day that had ≥ 1 batch.
     *
     * Both numbers are needed because the dashboard's `view_mode='cumulative'`
     * series is the running PERIOD average across all batches in the period:
     *
     *     running_avg(D) = SUM(value)[start..D] / uniqExact(batch_id)[start..D]
     *
     * Per-day averages alone aren't enough — when batch counts differ across
     * days you can't recombine them. Worked example, one account:
     *
     *     day 0:  10 batches × 100 each  →  sum=1000, batches=10
     *     day 1:   2 batches × 1000 each →  sum=2000, batches= 2
     *
     *     truth after day 1 = (10·100 + 2·1000) / 12     = 250
     *     formatter:          (1000 + 2000) / (10 + 2)   = 250 ✓
     *     avg-of-daily-avgs:  (100 + 1000) / 2           = 550 ✗
     *
     * Returning the two associative accumulators lets the formatter weight
     * batches correctly at every day boundary.
     *
     * `batches` is `uniqExact(batch_id)` (distinct Orb-equivalent batches),
     * NOT the row count: one batch produces multiple rows in `daily_raw_records`
     * (one per slice). The flat `SUM(value)` is equivalent to the two-level
     * "sum per batch, then aggregate across batches" pattern the S3 export cron
     * uses — we skip the inner GROUP BY because SUM is associative across
     * grouping levels. The S3 cron keeps the inner step because its outer op
     * is AVG, which isn't.
     *
     * Dimension breakdown — `batches` is the GLOBAL per-day count, not per-dim.
     * The dim branch JOINs each dimension row against the day's global batch
     * count so every series shares the same denominator. This makes per-dim
     * running averages **additive to the global**: their sum at any day equals
     * the no-dim global average for that day. The alternative (per-dim batch
     * count) would give "average size of dim when present", which is meaningful
     * but doesn't compose with the global view — wrong for a billing dashboard
     * where the breakdown is expected to decompose the bill total.
     *
     * Running-avg reconstruction lives in the server-side formatter (separate
     * ticket), mirroring `toCumulativeUsage` on the Orb path. Capping doesn't
     * consume these primitives — it reads Postgres for these metrics.
     */
    async getDailySumAndBatches(query: GetDailySumAndBatchesQuery): Promise<Result<GetDailySumAndBatchesResult>> {
        if (!this.client) {
            return Err(new Error('Clickhouse client not initialized'));
        }
        const { accountId, metric, dimension, timeframe } = query;
        const startDate = timeframe.start.toISOString().split('T')[0];
        const endDate = timeframe.end.toISOString().split('T')[0];
        const table = `${this.database}.${tableForMetric(metric)}`;

        // 'none' branch: per-day batch count IS the no-dim denominator, simple SQL.
        // dim branch: per-dim sum + day-level global batches (so series are additive
        // to the global). The CTE `global_batches` is a single tiny aggregate scan;
        // the outer GROUP BY adds the dimension while keeping the same denominator
        // across dim values via INNER JOIN on day.
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
                GROUP BY day
            )
            SELECT
                t.day AS day,
                SUM(t.value) AS sum,
                any(g.batches) AS batches,
                t.${dimension} AS dimensionValue
            FROM ${table} t
            INNER JOIN global_batches g ON g.day = t.day
            WHERE t.account_id = ${accountId}
            AND t.day >= toDate('${startDate}')
            AND t.day < toDate('${endDate}')
            GROUP BY t.day, t.${dimension}
            ORDER BY t.day, t.${dimension}
        `;

        try {
            const res = await this.client.query({ query: sql, format: 'JSONEachRow' });
            const rows = await res.json<{
                day: string;
                sum: string | number;
                batches: string | number;
                dimensionValue?: string;
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
                    const key = String(row.dimensionValue);
                    let entry = seriesMap.get(key);
                    if (!entry) {
                        entry = { dimension, dimensionValue: row.dimensionValue!, days: [] };
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

            return Ok({ accountId, metric, series });
        } catch (err) {
            return Err(new Error('Failed to execute Clickhouse daily sum+batches query', { cause: err }));
        }
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
