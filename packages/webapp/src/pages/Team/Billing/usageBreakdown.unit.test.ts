import { describe, expect, it } from 'vitest';

import { BREAKDOWN_DIMENSIONS, DIMENSION_LABELS, formatDimensionValue, metricsSupportingDimension } from './usageBreakdown.js';

import type { AnyBreakdownDimension } from './usageBreakdown.js';

describe('metricsSupportingDimension', () => {
    it('returns only records for model', () => {
        expect(metricsSupportingDimension('model')).toEqual(['records']);
    });

    it('returns every metric for integration_id and environment_id', () => {
        const all = Object.keys(BREAKDOWN_DIMENSIONS);
        expect(metricsSupportingDimension('integration_id')).toEqual(all);
        expect(metricsSupportingDimension('environment_id')).toEqual(all);
    });

    it('returns only the function metrics for function_name / function_type', () => {
        const fnMetrics = ['function_executions', 'function_compute_gbms', 'function_logs'];
        expect(metricsSupportingDimension('function_name').sort()).toEqual([...fnMetrics].sort());
        expect(metricsSupportingDimension('function_type').sort()).toEqual([...fnMetrics].sort());
    });

    it('returns the metrics that carry a success flag', () => {
        expect(metricsSupportingDimension('success').sort()).toEqual(
            ['proxy', 'webhook_forwards', 'function_executions', 'function_compute_gbms', 'function_logs'].sort()
        );
    });
});

describe('formatDimensionValue', () => {
    it('maps the success booleans to Success / Failed', () => {
        expect(formatDimensionValue('success', 'true')).toBe('Success');
        expect(formatDimensionValue('success', 'false')).toBe('Failed');
    });

    it('passes through unexpected success values and every other dimension verbatim', () => {
        expect(formatDimensionValue('success', 'pending')).toBe('pending');
        expect(formatDimensionValue('integration_id', 'true')).toBe('true');
        expect(formatDimensionValue('model', 'gpt-4o')).toBe('gpt-4o');
    });
});

describe('dimension config integrity', () => {
    it('has a human label for every dimension referenced by any metric', () => {
        const referenced = new Set<AnyBreakdownDimension>(Object.values(BREAKDOWN_DIMENSIONS).flat());
        for (const dim of referenced) {
            expect(DIMENSION_LABELS[dim], `missing label for "${dim}"`).toBeTruthy();
        }
    });
});
