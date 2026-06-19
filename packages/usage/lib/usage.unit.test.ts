import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { envs } from './env.js';
import {
    resolveBillingUsageSource,
    shouldShadow,
    shouldShadowCapping,
    shouldUseClickhouseFor,
    toCounterBillingMetricSeries,
    toRunningAvgUsage
} from './usage.js';

import type { GetDailyCounterResult, GetDailySumAndBatchesResult } from './clickhouse/clickhouse.query.js';

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

    it('ships the float running-average as-is (Orb does the same; rounding crushes low-volume dims)', () => {
        // 100 / 3 = 33.33...
        const result: GetDailySumAndBatchesResult = {
            accountId,
            metric: 'records',
            series: [{ days: [{ day: day(0), sum: 100, batches: 3 }] }]
        };
        const [out] = toRunningAvgUsage(result);
        expect(out!.usage[0]!.quantity).toBeCloseTo(33.333333, 5);
        expect(out!.total).toBeCloseTo(33.333333, 5);
    });

    it('low-volume breakdown does NOT round to 0 (the reason we ship floats)', () => {
        // 1 record split across 3 dims with batches=3 each.
        // Pre-fix: each dim = round(1/3) = 0 → breakdown view showed all zeros.
        // Post-fix: each dim = 0.333..., breakdown preserves the contribution.
        const result: GetDailySumAndBatchesResult = {
            accountId,
            metric: 'records',
            series: [
                { dimension: 'integration_id', dimensionValue: 'a', days: [{ day: day(0), sum: 1, batches: 3 }] },
                { dimension: 'integration_id', dimensionValue: 'b', days: [{ day: day(0), sum: 1, batches: 3 }] },
                { dimension: 'integration_id', dimensionValue: 'c', days: [{ day: day(0), sum: 1, batches: 3 }] }
            ]
        };
        const out = toRunningAvgUsage(result);
        for (const m of out) {
            expect(m.usage[0]!.quantity).toBeGreaterThan(0);
            expect(m.usage[0]!.quantity).toBeCloseTo(1 / 3, 5);
        }
    });
});

describe('toCounterBillingMetricSeries', () => {
    it('emits one BillingUsageMetric per dimension series with the group set', () => {
        const input: GetDailyCounterResult = {
            accountId,
            metric: 'proxy',
            series: [
                {
                    dimension: 'success',
                    dimensionValue: true,
                    days: [
                        { day: day(0), value: 20 },
                        { day: day(1), value: 30 }
                    ]
                },
                {
                    dimension: 'success',
                    dimensionValue: false,
                    days: [{ day: day(0), value: 10 }]
                }
            ]
        };

        const out = toCounterBillingMetricSeries('proxy', input);

        expect(out).toEqual([
            {
                externalId: 'proxy',
                group: { key: 'success', value: 'true' },
                total: 50,
                view_mode: 'periodic',
                usage: [
                    { timeframeStart: day(0), timeframeEnd: day(1), quantity: 20 },
                    { timeframeStart: day(1), timeframeEnd: day(2), quantity: 30 }
                ]
            },
            {
                externalId: 'proxy',
                group: { key: 'success', value: 'false' },
                total: 10,
                view_mode: 'periodic',
                usage: [{ timeframeStart: day(0), timeframeEnd: day(1), quantity: 10 }]
            }
        ]);
    });

    it('the rest bucket carries `isRest: true` and group.value="rest" for display', () => {
        const input: GetDailyCounterResult = {
            accountId,
            metric: 'proxy',
            series: [
                {
                    dimension: 'connection_id',
                    dimensionValue: 'conn-a',
                    days: [{ day: day(0), value: 70 }]
                },
                {
                    dimension: 'connection_id',
                    isRest: true,
                    days: [{ day: day(0), value: 30 }]
                }
            ]
        };
        const out = toCounterBillingMetricSeries('proxy', input);
        expect(out[0]!.group).toEqual({ key: 'connection_id', value: 'conn-a' });
        expect(out[0]!.isRest).toBeUndefined();
        expect(out[1]!.group).toEqual({ key: 'connection_id', value: 'rest' });
        expect(out[1]!.isRest).toBe(true);
    });

    it('a real dim value literally named "rest" is distinguished from the rollup via `isRest`', () => {
        // A connection named 'rest' in top-N (NOT the rollup) and a separate
        // rollup bucket. Both have group.value='rest' on the wire, but only
        // the rollup carries isRest=true.
        const input: GetDailyCounterResult = {
            accountId,
            metric: 'proxy',
            series: [
                {
                    dimension: 'connection_id',
                    dimensionValue: 'rest',
                    days: [{ day: day(0), value: 50 }]
                },
                {
                    dimension: 'connection_id',
                    isRest: true,
                    days: [{ day: day(0), value: 20 }]
                }
            ]
        };
        const out = toCounterBillingMetricSeries('proxy', input);
        expect(out).toHaveLength(2);
        const real = out.find((m) => !m.isRest)!;
        const rollup = out.find((m) => m.isRest)!;
        expect(real.group).toEqual({ key: 'connection_id', value: 'rest' });
        expect(real.total).toBe(50);
        expect(rollup.group).toEqual({ key: 'connection_id', value: 'rest' });
        expect(rollup.total).toBe(20);
    });

    it('emits an empty array when the source has no series', () => {
        const empty: GetDailyCounterResult = { accountId, metric: 'proxy', series: [] };
        expect(toCounterBillingMetricSeries('proxy', empty)).toEqual([]);
    });
});

describe('shouldShadow', () => {
    const junePlus = { start: new Date('2026-06-15T00:00:00.000Z'), end: new Date('2026-06-20T00:00:00.000Z') };
    const preJune = { start: new Date('2026-05-15T00:00:00.000Z'), end: new Date('2026-05-20T00:00:00.000Z') };

    let originalFlag: boolean;
    beforeEach(() => {
        originalFlag = envs.FLAG_BILLING_USAGE_SHADOW_CLICKHOUSE;
    });
    afterEach(() => {
        (envs as any).FLAG_BILLING_USAGE_SHADOW_CLICKHOUSE = originalFlag;
    });

    it('returns false when the flag is off', () => {
        (envs as any).FLAG_BILLING_USAGE_SHADOW_CLICKHOUSE = false;
        expect(shouldShadow({ timeframe: junePlus })).toBe(false);
    });

    it('returns false when timeframe is missing', () => {
        (envs as any).FLAG_BILLING_USAGE_SHADOW_CLICKHOUSE = true;
        expect(shouldShadow(undefined)).toBe(false);
        expect(shouldShadow({})).toBe(false);
    });

    it('returns false when the timeframe starts before 2026-06-01', () => {
        (envs as any).FLAG_BILLING_USAGE_SHADOW_CLICKHOUSE = true;
        expect(shouldShadow({ timeframe: preJune })).toBe(false);
    });

    it('returns true when flag is on and timeframe starts on/after 2026-06-01', () => {
        (envs as any).FLAG_BILLING_USAGE_SHADOW_CLICKHOUSE = true;
        expect(shouldShadow({ timeframe: junePlus })).toBe(true);
        expect(shouldShadow({ timeframe: { start: new Date('2026-06-01T00:00:00.000Z'), end: new Date('2026-06-02T00:00:00.000Z') } })).toBe(true);
    });
});

describe('shouldShadowCapping', () => {
    const someTimeframe = { start: new Date('2026-06-15T00:00:00.000Z'), end: new Date('2026-06-20T00:00:00.000Z') };

    let originalPct: number;
    let randomSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        originalPct = envs.FLAG_BILLING_USAGE_CAPPING_SHADOW_CLICKHOUSE_PERCENTAGE;
        randomSpy = vi.spyOn(Math, 'random');
    });
    afterEach(() => {
        (envs as any).FLAG_BILLING_USAGE_CAPPING_SHADOW_CLICKHOUSE_PERCENTAGE = originalPct;
        randomSpy.mockRestore();
    });

    it('returns false when the percentage is at the default 0 (killswitch)', () => {
        (envs as any).FLAG_BILLING_USAGE_CAPPING_SHADOW_CLICKHOUSE_PERCENTAGE = 0;
        randomSpy.mockReturnValue(0); // even a 0 roll shouldn't fire
        expect(shouldShadowCapping(undefined)).toBe(false);
        expect(shouldShadowCapping({})).toBe(false);
    });

    it('returns false when a timeframe is present (dashboard path, not capping)', () => {
        (envs as any).FLAG_BILLING_USAGE_CAPPING_SHADOW_CLICKHOUSE_PERCENTAGE = 100;
        randomSpy.mockReturnValue(0);
        expect(shouldShadowCapping({ timeframe: someTimeframe })).toBe(false);
    });

    it('fires when the random roll is under the percentage', () => {
        (envs as any).FLAG_BILLING_USAGE_CAPPING_SHADOW_CLICKHOUSE_PERCENTAGE = 25;
        randomSpy.mockReturnValue(0.24); // 24% — under 25%
        expect(shouldShadowCapping(undefined)).toBe(true);
    });

    it('does not fire when the random roll is at or over the percentage', () => {
        (envs as any).FLAG_BILLING_USAGE_CAPPING_SHADOW_CLICKHOUSE_PERCENTAGE = 25;
        randomSpy.mockReturnValue(0.25); // 25% — boundary, NOT under
        expect(shouldShadowCapping(undefined)).toBe(false);
        randomSpy.mockReturnValue(0.99);
        expect(shouldShadowCapping(undefined)).toBe(false);
    });

    it('always fires at 100%', () => {
        (envs as any).FLAG_BILLING_USAGE_CAPPING_SHADOW_CLICKHOUSE_PERCENTAGE = 100;
        randomSpy.mockReturnValue(0.999);
        expect(shouldShadowCapping(undefined)).toBe(true);
    });
});

describe('shouldUseClickhouseFor', () => {
    let originalCsv: string;
    let originalPct: number;
    beforeEach(() => {
        originalCsv = envs.FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS;
        originalPct = envs.FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE;
    });
    afterEach(() => {
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = originalCsv;
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE = originalPct;
    });

    it('returns false when both flags are at defaults', () => {
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = '';
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE = 0;
        expect(shouldUseClickhouseFor(0)).toBe(false);
        expect(shouldUseClickhouseFor(99)).toBe(false);
        expect(shouldUseClickhouseFor(15714)).toBe(false);
    });

    it('returns true when accountId is in the CSV allowlist (whitespace-tolerant)', () => {
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = '15714,  4242 ,  77 ';
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE = 0;
        expect(shouldUseClickhouseFor(15714)).toBe(true);
        expect(shouldUseClickhouseFor(4242)).toBe(true);
        expect(shouldUseClickhouseFor(77)).toBe(true);
        expect(shouldUseClickhouseFor(99)).toBe(false);
    });

    it('ignores non-numeric junk in the CSV without falsely matching', () => {
        // Includes scientific (1e5 → 100000), hex (0x10 → 16) and decimal (1.5)
        // forms that Number() would happily coerce — all must be rejected.
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = 'abc,,15714,123abc,1e5,0x10,1.5,';
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE = 0;
        expect(shouldUseClickhouseFor(15714)).toBe(true);
        expect(shouldUseClickhouseFor(0)).toBe(false);
        expect(shouldUseClickhouseFor(123)).toBe(false);
        expect(shouldUseClickhouseFor(100000)).toBe(false);
        expect(shouldUseClickhouseFor(16)).toBe(false);
    });

    it('returns true when accountId falls inside the percentage bucket', () => {
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = '';
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE = 25;
        expect(shouldUseClickhouseFor(0)).toBe(true);
        expect(shouldUseClickhouseFor(24)).toBe(true);
        expect(shouldUseClickhouseFor(124)).toBe(true);
        expect(shouldUseClickhouseFor(25)).toBe(false);
        expect(shouldUseClickhouseFor(99)).toBe(false);
        expect(shouldUseClickhouseFor(125)).toBe(false);
    });

    it('100% rollout includes every accountId', () => {
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = '';
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE = 100;
        expect(shouldUseClickhouseFor(0)).toBe(true);
        expect(shouldUseClickhouseFor(99)).toBe(true);
        expect(shouldUseClickhouseFor(15714)).toBe(true);
    });

    it('allowlist + percentage are unioned', () => {
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = '999';
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE = 10;
        expect(shouldUseClickhouseFor(999)).toBe(true);
        expect(shouldUseClickhouseFor(5)).toBe(true);
        expect(shouldUseClickhouseFor(50)).toBe(false);
    });
});

describe('resolveBillingUsageSource', () => {
    let originalOverride: boolean;
    let originalCsv: string;
    let originalPct: number;
    beforeEach(() => {
        originalOverride = envs.FLAG_ALLOW_OVERRIDE_GETUSAGE_SERVICE;
        originalCsv = envs.FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS;
        originalPct = envs.FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE;
    });
    afterEach(() => {
        (envs as any).FLAG_ALLOW_OVERRIDE_GETUSAGE_SERVICE = originalOverride;
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = originalCsv;
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_PERCENTAGE = originalPct;
    });

    it('explicit `orb` wins over a positive rollout when the override flag is on', () => {
        (envs as any).FLAG_ALLOW_OVERRIDE_GETUSAGE_SERVICE = true;
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = '42';
        expect(resolveBillingUsageSource(42, 'orb')).toBe('orb');
    });

    it('explicit `clickhouse` wins when the override flag is on', () => {
        (envs as any).FLAG_ALLOW_OVERRIDE_GETUSAGE_SERVICE = true;
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = '';
        expect(resolveBillingUsageSource(42, 'clickhouse')).toBe('clickhouse');
    });

    it('explicit source is ignored when the override flag is off (falls to rollout)', () => {
        (envs as any).FLAG_ALLOW_OVERRIDE_GETUSAGE_SERVICE = false;
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = '42';
        expect(resolveBillingUsageSource(42, 'orb')).toBe('clickhouse');
    });

    it('falls back to the rollout when no explicit source is set', () => {
        (envs as any).FLAG_ALLOW_OVERRIDE_GETUSAGE_SERVICE = true;
        (envs as any).FLAG_BILLING_USAGE_CLICKHOUSE_ROLLOUT_ACCOUNT_IDS = '42';
        expect(resolveBillingUsageSource(42, undefined)).toBe('clickhouse');
        expect(resolveBillingUsageSource(7, undefined)).toBe('orb');
    });
});
