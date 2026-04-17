import { ENVS, Err, Ok, parseEnvs, stringifyError } from '@nangohq/utils';

import { Batcher } from './batcher.js';
import { clickhouseClient, database as usageDatabase } from './config.js';
import { logger } from '../logger.js';
import { granularityGroupBy, granularityOrderBy, quantityForMetric, startSelect, tableForMetric } from './clickhouse.query.js';

import type { GetUsageQuery, GetUsageResult, GetUsageResultSeries } from './clickhouse.query.js';
import type { UsageEvent, UsageMetric } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const envs = parseEnvs(ENVS);

export interface ClickhouseRawUsageEvent {
    ts: number; // Unix timestamp in milliseconds, matches DateTime64(3)
    idempotency_key: UsageEvent['idempotencyKey'];
    type: UsageEvent['type'];
    value: UsageEvent['payload']['value'];
    account_id: UsageEvent['payload']['properties']['accountId'];
    attributes: Omit<UsageEvent['payload']['properties'], 'accountId'>;
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
        const rows = events.flatMap((event) => {
            const row = toRow(event);
            return row && row.value > 0 ? [row] : [];
        });
        return this.batcher.add(...rows);
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
                    case 'connections':
                        // not implemented yet
                        return undefined;
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

                    // sort series by dimension value for consistent ordering
                    const series = Object.entries(seriesMap)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([, value]) => value);

                    const total = rows.reduce((sum, row) => sum + row.quantity, 0);

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

function toRow(event: UsageEvent): ClickhouseRawUsageEvent | null {
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
