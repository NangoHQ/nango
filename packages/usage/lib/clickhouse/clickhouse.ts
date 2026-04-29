import { ENVS, Err, Ok, parseEnvs, stringifyError } from '@nangohq/utils';

import { Batcher } from './batcher.js';
import { clickhouseClient, database as usageDatabase } from './config.js';
import { logger } from '../logger.js';
import { granularityGroupBy, granularityOrderBy, quantityForMetric, startSelect, tableForMetric } from './clickhouse.query.js';

import type { GetUsageQuery, GetUsageResult, GetUsageResultSeries } from './clickhouse.query.js';
import type { UsageActionsEvent, UsageConnectionsEvent, UsageEvent, UsageFunctionExecutionsEvent, UsageMetric, UsageRecordsEvent } from '@nangohq/types';
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
            process: async (events) => {
                try {
                    await client.insert({
                        table: 'raw_events',
                        values: events,
                        format: 'JSONEachRow'
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

    async getUsage(query: GetUsageQuery): Promise<Result<GetUsageResult>> {
        if (!this.client) {
            return Err(new Error('Clickhouse client not initialized'));
        }

        try {
            const qs = (Object.keys(query.metrics) as UsageMetric[]).map(async (metric) => {
                const dimension = query.metrics[metric]?.dimension || 'none';
                const dimensionColumn = dimension === 'none' ? "'none'" : dimension; // quoted 'none' to be used directly in SQL queries as a string literal when no dimension is needed
                const dimensionSelect = `, ${dimensionColumn}`;
                const dimensionGroupBy = dimensionColumn ? `, ${dimensionColumn}` : '';
                const dimensionOrderBy = dimensionColumn ? `, ${dimensionColumn}` : '';
                switch (metric) {
                    case 'proxy':
                    case 'function_executions':
                    case 'function_logs':
                    case 'function_compute_gbms':
                    case 'webhook_forwards': {
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
                            }[],
                            viewMode: 'periodic' as const
                        };
                    }
                    case 'records':
                    case 'connections': {
                        // Gauge metrics (ie: snapshot emitted at interval)
                        // Quantity is considered to be the average of all snapshots for a given day
                        // Two-level query to correctly aggregate across sub-groups:
                        //   inner: avgMerge accross all dimensions ORDER BY key
                        //   outer: SUM per requested dimension: avg(A)+avg(B) = avg(A+B)
                        const innerGroupBy = (() => {
                            switch (metric) {
                                case 'records':
                                    return `account_id, day, environment_id, integration_id, connection_id, model`;
                                case 'connections':
                                    return `account_id, day, environment_id, integration_id`;
                            }
                        })();
                        const startDate = query.timeframe.start.toISOString().split('T')[0];
                        const endDate = query.timeframe.end.toISOString().split('T')[0];
                        const quantityExpr = (() => {
                            switch (query.granularity) {
                                case 'none':
                                    return `ROUND(SUM(avg_val) / GREATEST(1, dateDiff('day', toDate('${startDate}'), toDate('${endDate}'))))`;
                                case 'day':
                                    return `ROUND(SUM(avg_val))`;
                            }
                        })();
                        const sql = `
                            SELECT
                                ${quantityExpr} AS quantity,
                                ${startSelect(query)}
                                ${dimensionSelect} AS dimension
                            FROM (
                                SELECT
                                    avgMerge(value) AS avg_val,
                                    ${innerGroupBy}
                                FROM ${this.database}.${tableForMetric(metric)}
                                WHERE account_id = ${query.accountId}
                                AND day >= toDate('${startDate}')
                                AND day < toDate('${endDate}')
                                GROUP BY ${innerGroupBy}
                            )
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
                            }[],
                            viewMode: 'cumulative' as const
                        };
                    }
                }
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
                    const { metric, dimension, rows, viewMode } = entry.value;
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

                    const shouldProrate = viewMode === 'cumulative' && query.granularity === 'day';
                    const timeframeDays = shouldProrate
                        ? Math.max(1, (query.timeframe.end.getTime() - query.timeframe.start.getTime()) / (1000 * 60 * 60 * 24))
                        : 1;

                    // sort series by dimension value for consistent ordering
                    const series = Object.entries(seriesMap)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([, value]) => {
                            if (shouldProrate) {
                                value.total = Math.round(value.total / timeframeDays);
                            }
                            return value;
                        });

                    const seriesTotal = rows.reduce((sum, row) => sum + row.quantity, 0);
                    const total = shouldProrate ? Math.round(seriesTotal / timeframeDays) : seriesTotal;

                    usage.metrics[metric] = {
                        series,
                        total,
                        view_mode: viewMode
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

    async shutdown(): Promise<Result<void>> {
        const res = this.batcher ? await this.batcher.shutdown() : Ok(undefined);

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
