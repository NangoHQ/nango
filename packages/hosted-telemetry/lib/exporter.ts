import { ExportResultCode } from '@opentelemetry/core';
import { AggregationTemporality, AggregationType, DataPointType, InstrumentType } from '@opentelemetry/sdk-metrics';

import { getLogger, stringifyError } from '@nangohq/utils';

import { HOSTED_TELEMETRY_TABLE } from './postgres/schema.js';

import type { ExportResult } from '@opentelemetry/core';
import type { AggregationOption, PushMetricExporter, ResourceMetrics } from '@opentelemetry/sdk-metrics';
import type { Knex } from 'knex';

const logger = getLogger('hosted-telemetry');

export const PRODUCER_ID_ATTRIBUTE = 'producer_id';

const INSERT_BATCH_SIZE = 1000;

export interface MetricRow {
    metric: string;
    attributes: Record<string, string | number | boolean>;
    value: number;
}

/** One row per sum or gauge point, four per histogram point: count, sum, min and max. */
export function flatten(batch: ResourceMetrics): MetricRow[] {
    const producerId = batch.resource.attributes[PRODUCER_ID_ATTRIBUTE];
    const rows: MetricRow[] = [];
    const push = (metric: string, attributes: MetricRow['attributes'], value: number | undefined) => {
        if (value !== undefined && Number.isFinite(value)) {
            rows.push({ metric, attributes, value });
        }
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
    return rows;
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
        void this.write(flatten(batch)).then(
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
        try {
            await this.insert(rows);
        } catch {
            await this.insert(rows);
        }
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
