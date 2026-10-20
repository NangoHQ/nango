import { ExportResultCode, hrTimeToMilliseconds } from '@opentelemetry/core';
import { AggregationTemporality, AggregationType, DataPointType, InstrumentType } from '@opentelemetry/sdk-metrics';
import tracer from 'dd-trace';

import { getLogger, retry, stringifyError } from '@nangohq/utils';

import { HOSTED_TELEMETRY_ATTRIBUTES_MAX_BYTES, HOSTED_TELEMETRY_TABLE } from './postgres/schema.js';

import type { Attributes } from '@opentelemetry/api';
import type { ExportResult } from '@opentelemetry/core';
import type { AggregationOption, DataPoint, PushMetricExporter, ResourceMetrics } from '@opentelemetry/sdk-metrics';
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
    return JSON.stringify(attributes, Object.keys(attributes).sort());
}

/** The table stores scalar attributes only; an array or a non-finite number is a producer bug, not something to stringify. */
function scalarAttributes(attributes: Attributes): MetricRow['attributes'] | undefined {
    const scalars: MetricRow['attributes'] = {};
    for (const [key, value] of Object.entries(attributes)) {
        if (value === undefined) {
            continue;
        }
        if (typeof value === 'number' ? !Number.isFinite(value) : typeof value !== 'string' && typeof value !== 'boolean') {
            return undefined;
        }
        scalars[key] = value;
    }
    return scalars;
}

/**
 * One row per sum or gauge point, four per histogram point: count, sum, min and max. A histogram window with no
 * samples has no min or max and gets no row for them. A value that is not a finite number, or attributes the table
 * would refuse, an array value or too many bytes, is a producer bug: counted in `dropped` so the export can say so, instead of failing every row with
 * it. Two points with the same key, which only happens when one name is used as two instrument kinds, keep the last.
 *
 * A row is stamped with the point's start time: with delta temporality that is the previous collection, so one
 * producer's exports never share a key, and a retry of the same export rewrites the same rows.
 */
export function flatten(batch: ResourceMetrics): { rows: MetricRow[]; dropped: Record<string, number> } {
    const producerId = batch.resource.attributes[PRODUCER_ID_ATTRIBUTE];
    const rows = new Map<string, MetricRow>();
    const dropped: Record<string, number> = {};
    const drop = (metric: string, count = 1) => {
        dropped[metric] = (dropped[metric] ?? 0) + count;
    };
    const prepare = (dataPoint: DataPoint<unknown>, metric: string): { ts: Date; attributes: MetricRow['attributes'] } | undefined => {
        const attributes = scalarAttributes({ ...dataPoint.attributes, [PRODUCER_ID_ATTRIBUTE]: producerId });
        if (!attributes) {
            drop(metric);
            return undefined;
        }
        return { ts: new Date(hrTimeToMilliseconds(dataPoint.startTime)), attributes };
    };
    const push = ({ ts, attributes }: { ts: Date; attributes: MetricRow['attributes'] }, metric: string, value: number | undefined) => {
        if (value === undefined) {
            return;
        }
        const serialized = serializeAttributes(attributes);
        if (!Number.isFinite(value) || Buffer.byteLength(serialized) > HOSTED_TELEMETRY_ATTRIBUTES_MAX_BYTES) {
            drop(metric);
            return;
        }
        rows.set(`${ts.getTime()} ${metric} ${serialized}`, { ts, metric, attributes, value });
    };
    for (const scope of batch.scopeMetrics) {
        for (const metric of scope.metrics) {
            const name = metric.descriptor.name;
            switch (metric.dataPointType) {
                case DataPointType.SUM:
                case DataPointType.GAUGE:
                    for (const dataPoint of metric.dataPoints) {
                        const prepared = prepare(dataPoint, name);
                        if (prepared) {
                            push(prepared, name, dataPoint.value);
                        }
                    }
                    break;
                case DataPointType.HISTOGRAM:
                    for (const dataPoint of metric.dataPoints) {
                        const prepared = prepare(dataPoint, name);
                        if (prepared) {
                            push(prepared, `${name}.count`, dataPoint.value.count);
                            push(prepared, `${name}.sum`, dataPoint.value.sum);
                            push(prepared, `${name}.min`, dataPoint.value.min);
                            push(prepared, `${name}.max`, dataPoint.value.max);
                        }
                    }
                    break;
                case DataPointType.EXPONENTIAL_HISTOGRAM:
                    drop(name, metric.dataPoints.length);
                    break;
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
