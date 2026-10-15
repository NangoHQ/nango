import { ExportResultCode, hrTimeToMilliseconds } from '@opentelemetry/core';
import { AggregationTemporality, AggregationType, DataPointType, InstrumentType } from '@opentelemetry/sdk-metrics';
import tracer from 'dd-trace';

import { getLogger, retry, stringifyError } from '@nangohq/utils';

import { HOSTED_TELEMETRY_ATTRIBUTES_MAX_BYTES, HOSTED_TELEMETRY_TABLE } from './postgres/schema.js';

import type { ExportResult } from '@opentelemetry/core';
import type { AggregationOption, PushMetricExporter, ResourceMetrics } from '@opentelemetry/sdk-metrics';
import type { Knex } from 'knex';

const logger = getLogger('hosted-telemetry');

export const PRODUCER_ID_ATTRIBUTE = 'producer_id';

const INSERT_BATCH_SIZE = 1000;
const INSERT_ATTEMPTS = 2;
const INSERT_RETRY_DELAY_MS = 500;

export interface MetricRow {
    ts: Date;
    metric: string;
    attributes: Record<string, string | number | boolean>;
    value: number;
}

/** Stable key order, so the same attributes always serialize the same way. */
export function serializeAttributes(attributes: MetricRow['attributes']): string {
    return JSON.stringify(Object.fromEntries(Object.entries(attributes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
}

/**
 * One row per sum or gauge point, four per histogram point: count, sum, min and max. A histogram window with no
 * samples has no min or max and gets no row for them. A value that is not a finite number, or attributes the table
 * would refuse, is a producer bug: counted in `dropped` so the export can say so, instead of failing every row with
 * it. Two points with the same key, which only happens when one name is used as two instrument kinds, keep the last.
 *
 * A row is stamped with the point's start time: with delta temporality that is the previous collection, so one
 * producer's exports never share a key, and a retry of the same export rewrites the same rows.
 */
export function flatten(batch: ResourceMetrics): { rows: MetricRow[]; dropped: Record<string, number> } {
    const producerId = batch.resource.attributes[PRODUCER_ID_ATTRIBUTE];
    const rows = new Map<string, MetricRow>();
    const dropped: Record<string, number> = {};
    const push = (ts: Date, metric: string, attributes: MetricRow['attributes'], value: number | undefined) => {
        if (value === undefined) {
            return;
        }
        const serialized = serializeAttributes(attributes);
        if (!Number.isFinite(value) || Buffer.byteLength(serialized) > HOSTED_TELEMETRY_ATTRIBUTES_MAX_BYTES) {
            dropped[metric] = (dropped[metric] ?? 0) + 1;
            return;
        }
        rows.set(`${ts.getTime()} ${metric} ${serialized}`, { ts, metric, attributes, value });
    };
    for (const scope of batch.scopeMetrics) {
        for (const metric of scope.metrics) {
            const name = metric.descriptor.name;
            for (const dataPoint of metric.dataPoints) {
                const ts = new Date(hrTimeToMilliseconds(dataPoint.startTime));
                const attributes = { ...dataPoint.attributes, [PRODUCER_ID_ATTRIBUTE]: producerId } as MetricRow['attributes'];
                if (metric.dataPointType === DataPointType.SUM || metric.dataPointType === DataPointType.GAUGE) {
                    push(ts, name, attributes, dataPoint.value as number);
                } else {
                    const value = dataPoint.value as { count: number; sum?: number; min?: number; max?: number };
                    push(ts, `${name}.count`, attributes, value.count);
                    push(ts, `${name}.sum`, attributes, value.sum);
                    push(ts, `${name}.min`, attributes, value.min);
                    push(ts, `${name}.max`, attributes, value.max);
                }
            }
        }
    }
    return { rows: [...rows.values()], dropped };
}

export class PostgresMetricExporter implements PushMetricExporter {
    private readonly knex: Knex;
    private readonly schema: string;

    constructor({ knex, schema }: { knex: Knex; schema: string }) {
        this.knex = knex;
        this.schema = schema;
    }

    /** Delta: the SDK resets every instrument after each export, so a row describes its own window, never a running total. */
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
        void tracer.trace('nango.hosted_telemetry.export', async (span) => {
            const { rows, dropped } = flatten(batch);
            const droppedMetrics = Object.entries(dropped);
            if (droppedMetrics.length > 0) {
                logger.warning(`Dropped values the table would refuse: ${droppedMetrics.map(([metric, count]) => `${metric} x${count}`).join(', ')}`);
            }
            span?.addTags({ rows: rows.length, dropped: droppedMetrics.reduce((sum, [, count]) => sum + count, 0) });
            try {
                await this.write(rows);
                resultCallback({ code: ExportResultCode.SUCCESS });
            } catch (err) {
                span?.addTags({ error: stringifyError(err, { cause: true }) });
                logger.error(`Dropped a hosted telemetry export of ${rows.length} rows: ${stringifyError(err, { cause: true })}`);
                resultCallback({ code: ExportResultCode.FAILED, error: err instanceof Error ? err : new Error(String(err)) });
            } finally {
                span?.finish();
            }
        });
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
                const values = chunk.map(() => '(?, ?, ?::jsonb, ?::double precision)').join(', ');
                await trx.raw(
                    `INSERT INTO ??.?? (ts, metric, attributes, value) VALUES ${values}
                     ON CONFLICT (metric, ts, attributes) DO UPDATE SET value = EXCLUDED.value`,
                    [this.schema, HOSTED_TELEMETRY_TABLE, ...chunk.flatMap((row) => [row.ts, row.metric, serializeAttributes(row.attributes), row.value])]
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
