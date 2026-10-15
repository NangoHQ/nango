import { ValueType } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { DataPointType, InstrumentType } from '@opentelemetry/sdk-metrics';
import { describe, expect, it } from 'vitest';

import { flatten } from './exporter.js';

import type { MetricData, ResourceMetrics } from '@opentelemetry/sdk-metrics';

const descriptor = (name: string, type: InstrumentType) => ({ name, description: '', unit: '', type, valueType: ValueType.DOUBLE });
const start = new Date('2026-10-15T10:00:00.000Z');
const time = { startTime: [start.getTime() / 1000, 0] as [number, number], endTime: [start.getTime() / 1000 + 60, 0] as [number, number] };

function batch(metrics: MetricData[]): ResourceMetrics {
    return { resource: resourceFromAttributes({ producer_id: 'pod-a' }), scopeMetrics: [{ scope: { name: 'test' }, metrics }] };
}

describe('flatten', () => {
    it('writes one row per sum or gauge point, carrying the producer', () => {
        const { rows } = flatten(
            batch([
                {
                    descriptor: descriptor('nango.functions.executions', InstrumentType.COUNTER),
                    aggregationTemporality: 1,
                    dataPointType: DataPointType.SUM,
                    isMonotonic: true,
                    dataPoints: [
                        { ...time, attributes: { environment_id: 7 }, value: 47 },
                        { ...time, attributes: { environment_id: 8 }, value: 2 }
                    ]
                },
                {
                    descriptor: descriptor('nango.connections.count', InstrumentType.GAUGE),
                    aggregationTemporality: 1,
                    dataPointType: DataPointType.GAUGE,
                    dataPoints: [{ ...time, attributes: { environment_id: 7, integration_id: 'hubspot' }, value: 1283 }]
                }
            ])
        );
        expect(rows).toEqual([
            { ts: start, metric: 'nango.functions.executions', attributes: { environment_id: 7, producer_id: 'pod-a' }, value: 47 },
            { ts: start, metric: 'nango.functions.executions', attributes: { environment_id: 8, producer_id: 'pod-a' }, value: 2 },
            { ts: start, metric: 'nango.connections.count', attributes: { environment_id: 7, integration_id: 'hubspot', producer_id: 'pod-a' }, value: 1283 }
        ]);
    });

    it('fans a histogram point out to count, sum, min and max, skipping what the window did not record', () => {
        const { rows, dropped } = flatten(
            batch([
                {
                    descriptor: descriptor('nango.hosted_metric.active_concurrency', InstrumentType.HISTOGRAM),
                    aggregationTemporality: 1,
                    dataPointType: DataPointType.HISTOGRAM,
                    dataPoints: [
                        {
                            ...time,
                            attributes: { environment_id: 7 },
                            value: { count: 60, sum: 612, min: 7, max: 14, buckets: { boundaries: [], counts: [60] } }
                        },
                        { ...time, attributes: { environment_id: 8 }, value: { count: 0, sum: 0, buckets: { boundaries: [], counts: [0] } } }
                    ]
                }
            ])
        );
        expect(rows.map((r) => [r.metric, r.attributes['environment_id'], r.value])).toEqual([
            ['nango.hosted_metric.active_concurrency.count', 7, 60],
            ['nango.hosted_metric.active_concurrency.sum', 7, 612],
            ['nango.hosted_metric.active_concurrency.min', 7, 7],
            ['nango.hosted_metric.active_concurrency.max', 7, 14],
            ['nango.hosted_metric.active_concurrency.count', 8, 0],
            ['nango.hosted_metric.active_concurrency.sum', 8, 0]
        ]);
        expect(dropped).toEqual({});
    });

    it('drops a value the table would refuse instead of failing the whole export, and counts it', () => {
        const { rows, dropped } = flatten(
            batch([
                {
                    descriptor: descriptor('nango.connections.count', InstrumentType.GAUGE),
                    aggregationTemporality: 1,
                    dataPointType: DataPointType.GAUGE,
                    dataPoints: [
                        { ...time, attributes: { environment_id: 7 }, value: Number.NaN },
                        { ...time, attributes: { environment_id: 8 }, value: 3 }
                    ]
                }
            ])
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.attributes['environment_id']).toBe(8);
        expect(dropped).toEqual({ 'nango.connections.count': 1 });
    });

    it('drops attributes the table would refuse, and keeps the last of two points with one key', () => {
        const { rows, dropped } = flatten(
            batch([
                {
                    descriptor: descriptor('nango.connections.count', InstrumentType.GAUGE),
                    aggregationTemporality: 1,
                    dataPointType: DataPointType.GAUGE,
                    dataPoints: [
                        { ...time, attributes: { environment_id: 7, note: 'x'.repeat(1100) }, value: 1 },
                        { ...time, attributes: { environment_id: 8, integration_id: 'hubspot' }, value: 2 },
                        { ...time, attributes: { integration_id: 'hubspot', environment_id: 8 }, value: 3 }
                    ]
                }
            ])
        );
        expect(rows).toEqual([
            { ts: start, metric: 'nango.connections.count', attributes: { integration_id: 'hubspot', environment_id: 8, producer_id: 'pod-a' }, value: 3 }
        ]);
        expect(dropped).toEqual({ 'nango.connections.count': 1 });
    });
});
