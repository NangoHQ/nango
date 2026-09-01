import { describe, expect, it } from 'vitest';

import {
    billedUsageMetrics,
    formatLimit,
    formatMetricPair,
    formatMetricUsage,
    formatMetricUsageExact,
    formatUsage,
    formatUsageExact,
    getAggregateUsageState,
    getUsageState,
    getUsageStateTextColor,
    isOnS26Pricing,
    LEGACY_USAGE_METRICS,
    NEAR_LIMIT_RATIO,
    S26_USAGE_METRICS
} from './usage.js';

import type { ApiPlan } from '@nangohq/types';

describe('getUsageState', () => {
    it('is uncapped when there is no limit', () => {
        expect(getUsageState(1000, null)).toBe('uncapped');
        expect(getUsageState(0, null)).toBe('uncapped');
        // A 0 limit is treated as no cap (falsy), not an instant over.
        expect(getUsageState(50, 0)).toBe('uncapped');
    });

    it('is ok below the near threshold', () => {
        expect(getUsageState(0, 100)).toBe('ok');
        expect(getUsageState(69, 100)).toBe('ok');
    });

    it('is near from exactly the threshold up to the limit', () => {
        // NEAR_LIMIT_RATIO is 0.7, so 70/100 is the first "near" value.
        expect(getUsageState(70, 100)).toBe('near');
        expect(getUsageState(99, 100)).toBe('near');
        // Exact-ratio boundary independent of scale.
        expect(getUsageState(7, 10)).toBe('near');
    });

    it('is over at and above the limit', () => {
        expect(getUsageState(100, 100)).toBe('over');
        expect(getUsageState(150, 100)).toBe('over');
    });

    it('keeps the near threshold at 70%', () => {
        expect(NEAR_LIMIT_RATIO).toBe(0.7);
    });
});

describe('getUsageStateTextColor', () => {
    it('maps each state to its text colour', () => {
        expect(getUsageStateTextColor('uncapped')).toBe('text-text-muted');
        expect(getUsageStateTextColor('ok')).toBe('text-text-default');
        expect(getUsageStateTextColor('near')).toBe('text-text-warning');
        expect(getUsageStateTextColor('over')).toBe('text-text-danger');
    });
});

describe('getAggregateUsageState', () => {
    const ALL = ['connections', 'proxy', 'records', 'data_transfer'] as const;

    it('returns ok for no metrics', () => {
        expect(getAggregateUsageState({}, ALL)).toBe('ok');
    });

    it('returns ok when every capped metric is comfortably under its limit', () => {
        expect(getAggregateUsageState({ connections: { usage: 1, limit: 10 }, proxy: { usage: 2, limit: 100 } }, ALL)).toBe('ok');
    });

    it('returns near when a metric is close to its limit', () => {
        expect(getAggregateUsageState({ connections: { usage: 1, limit: 10 }, proxy: { usage: 9, limit: 10 } }, ALL)).toBe('near');
    });

    it('returns over when a metric is at or above its limit', () => {
        expect(getAggregateUsageState({ connections: { usage: 9, limit: 10 }, proxy: { usage: 10, limit: 10 } }, ALL)).toBe('over');
    });

    it('prefers over to near when both are present', () => {
        expect(getAggregateUsageState({ connections: { usage: 9, limit: 10 }, proxy: { usage: 20, limit: 10 } }, ALL)).toBe('over');
    });

    it('ignores uncapped metrics (null limit)', () => {
        expect(getAggregateUsageState({ proxy: { usage: 999_999, limit: null } }, ALL)).toBe('ok');
        expect(getAggregateUsageState({ proxy: { usage: 999_999, limit: null }, connections: { usage: 9, limit: 10 } }, ALL)).toBe('near');
    });

    it('ignores metrics the account is not billed on', () => {
        const metrics = { connections: { usage: 1, limit: 10 }, records: { usage: 100, limit: 10 } };
        expect(getAggregateUsageState(metrics, ['connections', 'records'])).toBe('over');
        expect(getAggregateUsageState(metrics, ['connections'])).toBe('ok');
    });
});

describe('billedUsageMetrics', () => {
    const on = (name: string) => billedUsageMetrics({ name } as ApiPlan, true);

    // Deliberately restates the source map: a wrong value there has to fail against something.
    const BILLED_ON: Record<ApiPlan['name'], 's26' | 'legacy'> = {
        free: 's26',
        'free-uncapped': 's26',
        'pay-as-you-go': 's26',
        'startup-deal': 'legacy',
        'starter-v2': 'legacy',
        'growth-v2': 'legacy',
        enterprise: 'legacy',
        'enterprise-cloud-hosted': 'legacy',
        starter: 'legacy',
        growth: 'legacy',
        'starter-legacy': 'legacy',
        'scale-legacy': 'legacy',
        'growth-legacy': 'legacy'
    };

    it('gives every plan the metrics it is billed on', () => {
        for (const [name, expected] of Object.entries(BILLED_ON)) {
            expect(on(name), name).toEqual(expected === 's26' ? S26_USAGE_METRICS : LEGACY_USAGE_METRICS);
        }
    });

    it('leaves the view untouched while the flag is off', () => {
        expect(billedUsageMetrics({ name: 'free' } as ApiPlan, false)).toEqual(LEGACY_USAGE_METRICS);
    });

    it('falls back to the legacy set before the plan has loaded', () => {
        expect(billedUsageMetrics(undefined, true)).toEqual(LEGACY_USAGE_METRICS);
    });
});

describe('isOnS26Pricing', () => {
    it('agrees with the metrics a plan is billed on', () => {
        expect(isOnS26Pricing({ name: 'pay-as-you-go' } as ApiPlan, true)).toBe(true);
        expect(isOnS26Pricing({ name: 'free' } as ApiPlan, true)).toBe(true);
        expect(isOnS26Pricing({ name: 'growth-v2' } as ApiPlan, true)).toBe(false);
    });

    it('is false while the flag is off, and before the plan has loaded', () => {
        expect(isOnS26Pricing({ name: 'pay-as-you-go' } as ApiPlan, false)).toBe(false);
        expect(isOnS26Pricing(undefined, true)).toBe(false);
    });
});

describe('formatMetricUsage', () => {
    it('leaves counts to the count formatter', () => {
        expect(formatMetricUsage('connections', 46)).toBe('46');
        expect(formatMetricUsage('proxy', 1_022_107)).toBe('1.02M');
    });

    it('shows compute in decimal hours', () => {
        expect(formatMetricUsage('function_duration_seconds', 26_460)).toBe('7.35h');
        expect(formatMetricUsage('function_duration_seconds', 3600)).toBe('1h');
        expect(formatMetricUsage('function_duration_seconds', 5_400_000)).toBe('1,500h');
    });

    it('shows data transfer in decimal GB, moving to TB', () => {
        expect(formatMetricUsage('data_transfer', 4_200_000_000)).toBe('4.2 GB');
        expect(formatMetricUsage('data_transfer', 999_000_000_000)).toBe('999 GB');
        expect(formatMetricUsage('data_transfer', 7_000_000_000_000)).toBe('7 TB');
    });

    it('distinguishes no usage from a little', () => {
        expect(formatMetricUsage('function_duration_seconds', 0)).toBe('0h');
        expect(formatMetricUsage('data_transfer', 0)).toBe('0 GB');
        // 5s and 4MB are real usage; both would round to an exact zero.
        expect(formatMetricUsage('function_duration_seconds', 5)).toBe('<0.01h');
        expect(formatMetricUsage('data_transfer', 4_000_000)).toBe('<0.01 GB');
    });
});

describe('formatMetricUsageExact', () => {
    it('keeps more precision than the cell, in the same unit', () => {
        expect(formatMetricUsageExact('function_duration_seconds', 26_461)).toBe('7.3503h');
        expect(formatMetricUsageExact('data_transfer', 4_234_567_890)).toBe('4.2346 GB');
    });
});

describe('formatMetricPair', () => {
    it('renders a count against its limit', () => {
        expect(formatMetricPair('connections', 7, 10)).toEqual({ usage: '7', limit: '10' });
        expect(formatMetricPair('proxy', 184_000, 100_000)).toEqual({ usage: '184k', limit: '100k' });
    });

    it('puts compute and its cap in the same unit', () => {
        expect(formatMetricPair('function_duration_seconds', 55_300, 50_000)).toEqual({ usage: '15.36h', limit: '13.89h' });
    });

    it('picks one byte scale for both sides', () => {
        // Usage in TB against a GB cap would otherwise read as far under the limit.
        expect(formatMetricPair('data_transfer', 1_500_000_000_000, 10_000_000_000)).toEqual({ usage: '1.5 TB', limit: '0.01 TB' });
        expect(formatMetricPair('data_transfer', 4_200_000_000, 10_000_000_000)).toEqual({ usage: '4.2 GB', limit: '10 GB' });
    });
});

describe('formatLimit', () => {
    it('abbreviates exact multiples of 1000 as K/M/B/T', () => {
        expect(formatLimit(1000)).toBe('1k');
        expect(formatLimit(2000)).toBe('2k');
        expect(formatLimit(1_000_000)).toBe('1M');
        expect(formatLimit(1_000_000_000)).toBe('1B');
        expect(formatLimit(1_000_000_000_000)).toBe('1T');
    });

    it('uses the largest exact unit and keeps a grouped remainder', () => {
        expect(formatLimit(1_234_000)).toBe('1,234k');
    });

    it('falls back to a grouped number when not an exact multiple', () => {
        expect(formatLimit(500)).toBe('500');
        expect(formatLimit(1500)).toBe('1,500');
        expect(formatLimit(2025)).toBe('2,025');
    });
});

describe('formatUsage', () => {
    it('shows anything under 10,000 in full', () => {
        expect(formatUsage(0)).toBe('0');
        expect(formatUsage(46)).toBe('46');
        expect(formatUsage(999)).toBe('999');
        expect(formatUsage(1046)).toBe('1,046');
        expect(formatUsage(9999)).toBe('9,999');
    });

    it('abbreviates from 10,000 up, keeping 3 significant digits', () => {
        expect(formatUsage(10_000)).toBe('10k');
        expect(formatUsage(12_345)).toBe('12.3k');
        expect(formatUsage(721_640)).toBe('722k');
        expect(formatUsage(1_022_107)).toBe('1.02M');
        expect(formatUsage(2_500_000_000)).toBe('2.5B');
    });

    // These are the values the previous divide-then-round formatter collapsed to a single
    // significant digit — a real account 22k into its 1M proxy allowance read as "1M / 1M".
    it('no longer hides usage just above a threshold', () => {
        expect(formatUsage(9943)).toBe('9,943');
        expect(formatUsage(1_499_999)).toBe('1.5M');
    });
});

describe('formatUsageExact', () => {
    it('never abbreviates, so an abbreviated cell can be reconciled', () => {
        expect(formatUsageExact(1_022_107)).toBe('1,022,107');
        expect(formatUsageExact(46)).toBe('46');
    });

    it('keeps the decimals on an averaged metric', () => {
        expect(formatUsageExact(50_072.5)).toBe('50,072.5');
    });
});

describe('formatUsage with a fractional total', () => {
    it('does not round an average up to its own limit', () => {
        // 9.5 of 10 connections must not read as 10 / 10.
        expect(formatUsage(9.5)).toBe('9.5');
    });
});
