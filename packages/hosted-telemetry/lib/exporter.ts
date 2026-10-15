import { ExportResultCode } from '@opentelemetry/core';
import { AggregationTemporality, AggregationType, DataPointType, InstrumentType } from '@opentelemetry/sdk-metrics';

import { getLogger, retry, stringifyError } from '@nangohq/utils';

import { HOSTED_TELEMETRY_TABLE } from './postgres/schema.js';

import type { ExportResult } from '@opentelemetry/core';
import type { AggregationOption, PushMetricExporter, ResourceMetrics } from '@opentelemetry/sdk-metrics';
import type { Knex } from 'knex';

const logger = getLogger('hosted-telemetry');

export const PRODUCER_ID_ATTRIBUTE = 'producer_id';

const INSERT_BATCH_SIZE = 1000;
const INSERT_ATTEMPTS = 2;
const INSERT_RETRY_DELAY_MS = 500;

export interface MetricRow {
    metric: string;
    attributes: Record<string, string | number | boolean>;
    value: number;
}

/**
 * One row per sum or gauge point, four per histogram point: count, sum, min and max. A histogram window with no
 * samples has no min or max and gets no row for them; a value that is not a finite number is a producer bug, counted
 * in `dropped` so the export can say so.
 */
export function flatten(batch: ResourceMetrics): { rows: MetricRow[]; dropped: Record<string, number> } {
    const producerId = batch.resource.attributes[PRODUCER_ID_ATTRIBUTE];
    const rows: MetricRow[] = [];
    const dropped: Record<string, number> = {};
    const push = (metric: string, attributes: MetricRow['attributes'], value: number | undefined) => {
        if (value === undefined) {
            return;
        }
        if (!Number.isFinite(value)) {
            dropped[metric] = (dropped[metric] ?? 0) + 1;
            return;
        }
        rows.push({ metric, attributes, value });
    };
    for (const scope of batch.scopeMetrics) {
        for (const metric of scope.metrics) {
            const name = metric.descriptor.name;
            for (const dataPoint of metric.dataPoints) {
                const attributes = { ...dataPoint.attributes, [PRODUCER_ID_ATTRIBUTE]: producerId } as MetricRow['attributes'];
                if (metric.dataPointType === DataPointType.SUM || metric.dataPointType === DataPointType.GAUGE) {
                    push(name, attributes, dataPoint.value as number);
                } else {
                    const value = dataPoint.value as { count: number; sum?: number; min?: number; max?: number };
                    push(`${name}.count`, attributes, value.count);
                    push(`${name}.sum`, attributes, value.sum);
                    push(`${name}.min`, attributes, value.min);
                    push(`${name}.max`, attributes, value.max);
                }
            }
        }
    }
    return { rows, dropped };
}

/**
 * Writes each export as one upsert per window. The window's timestamp comes from the Postgres clock, so every
 * producer labels the same minute the same way, and a second export into a window replaces the first.
 */
export class PostgresMetricExporter implements PushMetricExporter {
    private readonly knex: Knex;
    private readonly schema: string;
    private readonly windowSeconds: number;

    constructor({ knex, schema, windowMs }: { knex: Knex; schema: string; windowMs: number }) {
        this.knex = knex;
        this.schema = schema;
        this.windowSeconds = windowMs / 1000;
    }

    selectAggregationTemporality(): AggregationTemporality {
        return AggregationTemporality.DELTA;
    }

    selectAggregation(instrumentType: InstrumentType): AggregationOption {
        if (instrumentType === InstrumentType.HISTOGRAM) {
            return { type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM, options: { boundaries: [], recordMinMax: true } };
        }
        return { type: AggregationType.DEFAULT };
    }

    export(batch: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
        const { rows, dropped } = flatten(batch);
        const droppedMetrics = Object.entries(dropped);
        if (droppedMetrics.length > 0) {
            logger.warning(`Dropped values that are not finite numbers: ${droppedMetrics.map(([metric, count]) => `${metric} x${count}`).join(', ')}`);
        }
        void this.write(rows).then(
            () => resultCallback({ code: ExportResultCode.SUCCESS }),
            (err: unknown) => {
                logger.error(`Dropped a hosted telemetry export: ${stringifyError(err, { cause: true })}`);
                resultCallback({ code: ExportResultCode.FAILED, error: err instanceof Error ? err : new Error(String(err)) });
            }
        );
    }

    async write(rows: MetricRow[]): Promise<void> {
        if (rows.length === 0) {
            return;
        }
        await retry(() => this.insert(rows), { maxAttempts: INSERT_ATTEMPTS, delayMs: INSERT_RETRY_DELAY_MS });
    }

    private async insert(rows: MetricRow[]): Promise<void> {
        await this.knex.transaction(async (trx) => {
            for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
                const chunk = rows.slice(offset, offset + INSERT_BATCH_SIZE);
                const values = chunk.map(() => '(?, ?::jsonb, ?::double precision)').join(', ');
                await trx.raw(
                    `WITH w AS (SELECT to_timestamp(floor(extract(epoch FROM clock_timestamp()) / ?) * ?) AS ts)
                     INSERT INTO ??.?? (ts, metric, attributes, value)
                     SELECT w.ts, v.metric, v.attributes, v.value FROM w CROSS JOIN (VALUES ${values}) AS v(metric, attributes, value)
                     ON CONFLICT (metric, ts, attributes) DO UPDATE SET value = EXCLUDED.value`,
                    [
                        this.windowSeconds,
                        this.windowSeconds,
                        this.schema,
                        HOSTED_TELEMETRY_TABLE,
                        ...chunk.flatMap((row) => [row.metric, JSON.stringify(row.attributes), row.value])
                    ]
                );
            }
        });
    }

    forceFlush(): Promise<void> {
        return Promise.resolve();
    }

    shutdown(): Promise<void> {
        return Promise.resolve();
    }
}
