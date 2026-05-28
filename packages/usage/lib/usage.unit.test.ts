import { describe, expect, it } from 'vitest';

import { toRunningAvgUsage } from './usage.js';

import type { GetDailySumAndBatchesResult } from './clickhouse/clickhouse.query.js';

const accountId = 1;

function day(offset: number): Date {
    const d = new Date('2026-06-01T00:00:00.000Z');
    d.setUTCDate(d.getUTCDate() + offset);
    return d;
}

describe('toRunningAvgUsage', () => {
    it('emits the docstring worked example (10×100 vs 2×1000 → 100, 250)', () => {
        const result: GetDailySumAndBatchesResult = {
            accountId,
            metric: 'records',
            series: [
                {
                    days: [
                        { day: day(0), sum: 1000, batches: 10 },
                        { day: day(1), sum: 2000, batches: 2 }
                    ]
                }
            ]
        };

        const [out] = toRunningAvgUsage(result);

        expect(out).toEqual({
            externalId: 'records',
            total: 250,
            view_mode: 'cumulative',
            usage: [
                { timeframeStart: day(0), timeframeEnd: day(1), quantity: 100 },
                { timeframeStart: day(1), timeframeEnd: day(2), quantity: 250 }
            ]
        });
    });

    it('per-dim series are additive to the no-dim global (design B contract)', () => {
        // Same fixture as the AVG integration test: day 0 records (int=a: sum=2100,
        // int=b: sum=500; both share batches=3 because batches is global per day),
        // day 1 (int=a: sum=1100, int=b: sum=500; batches=2 global per day).
        const withDim: GetDailySumAndBatchesResult = {
            accountId,
            metric: 'records',
            series: [
                {
                    dimension: 'integration_id',
                    dimensionValue: 'a',
                    days: [
                        { day: day(0), sum: 2100, batches: 3 },
                        { day: day(1), sum: 1100, batches: 2 }
                    ]
                },
                {
                    dimension: 'integration_id',
                    dimensionValue: 'b',
                    days: [
                        { day: day(0), sum: 500, batches: 3 },
                        { day: day(1), sum: 500, batches: 2 }
                    ]
                }
            ]
        };
        const withoutDim: GetDailySumAndBatchesResult = {
            accountId,
            metric: 'records',
            series: [
                {
                    days: [
                        { day: day(0), sum: 2600, batches: 3 },
                        { day: day(1), sum: 1600, batches: 2 }
                    ]
                }
            ]
        };

        const dimMetrics = toRunningAvgUsage(withDim);
        const [globalMetric] = toRunningAvgUsage(withoutDim);

        expect(dimMetrics).toHaveLength(2);
        // Both per-dim series should carry a `group` with the dimension info.
        expect(dimMetrics[0]!.group).toEqual({ key: 'integration_id', value: 'a' });
        expect(dimMetrics[1]!.group).toEqual({ key: 'integration_id', value: 'b' });

        // Per-day additivity: Σᵢ quantity_i(D) === quantity_global(D), at every day.
        for (let i = 0; i < globalMetric!.usage.length; i++) {
            const globalDay = globalMetric!.usage[i]!;
            const dimSum = dimMetrics.reduce((acc, m) => acc + m.usage[i]!.quantity, 0);
            expect(dimSum).toBe(globalDay.quantity);
        }
        // And period total is additive too.
        const dimTotal = dimMetrics.reduce((acc, m) => acc + m.total, 0);
        expect(dimTotal).toBe(globalMetric!.total);
    });

    it('sorts days chronologically before accumulating (defends against unordered input)', () => {
        const result: GetDailySumAndBatchesResult = {
            accountId,
            metric: 'records',
            // Days deliberately out of order.
            series: [
                {
                    days: [
                        { day: day(1), sum: 2000, batches: 2 },
                        { day: day(0), sum: 1000, batches: 10 }
                    ]
                }
            ]
        };

        const [out] = toRunningAvgUsage(result);

        expect(out!.usage[0]!.timeframeStart).toEqual(day(0));
        expect(out!.usage[0]!.quantity).toBe(100);
        expect(out!.usage[1]!.timeframeStart).toEqual(day(1));
        expect(out!.usage[1]!.quantity).toBe(250);
    });

    it('skips series with no days', () => {
        const result: GetDailySumAndBatchesResult = {
            accountId,
            metric: 'connections',
            series: [{ days: [] }, { dimension: 'integration_id', dimensionValue: 'a', days: [] }]
        };
        expect(toRunningAvgUsage(result)).toEqual([]);
    });

    it('handles a single-day series', () => {
        const result: GetDailySumAndBatchesResult = {
            accountId,
            metric: 'connections',
            series: [{ days: [{ day: day(0), sum: 210, batches: 3 }] }]
        };
        const [out] = toRunningAvgUsage(result);
        expect(out!.usage).toEqual([{ timeframeStart: day(0), timeframeEnd: day(1), quantity: 70 }]);
        expect(out!.total).toBe(70);
    });

    it('rounds running averages to the nearest integer (matches Orb wire shape)', () => {
        // 100 / 3 = 33.33...
        const result: GetDailySumAndBatchesResult = {
            accountId,
            metric: 'records',
            series: [{ days: [{ day: day(0), sum: 100, batches: 3 }] }]
        };
        const [out] = toRunningAvgUsage(result);
        expect(out!.usage[0]!.quantity).toBe(33);
        expect(out!.total).toBe(33);
    });
});
