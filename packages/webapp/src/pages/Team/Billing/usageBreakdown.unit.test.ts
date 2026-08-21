import { describe, expect, it } from 'vitest';

import {
    BREAKDOWN_DIMENSIONS,
    breakdownSeriesCopyValue,
    breakdownSeriesHref,
    DIMENSION_LABELS,
    formatDimensionValue,
    isSearchableDimension,
    metricsSupportingDimension,
    parseFilterParam,
    resolveBreakdownDimension
} from './usageBreakdown.js';

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

describe('parseFilterParam', () => {
    const allowed = BREAKDOWN_DIMENSIONS.function_executions;

    it('parses <dimension>:<value>', () => {
        expect(parseFilterParam('environment_id:105', allowed)).toEqual({ dimension: 'environment_id', value: '105' });
    });

    it('splits on the first colon so a value containing colons survives', () => {
        expect(parseFilterParam('connection_id:https://example.com:8080', allowed)).toEqual({
            dimension: 'connection_id',
            value: 'https://example.com:8080'
        });
    });

    it('returns null for malformed input', () => {
        expect(parseFilterParam('', allowed)).toBeNull();
        expect(parseFilterParam('no-colon', allowed)).toBeNull();
        expect(parseFilterParam(':leading-colon', allowed)).toBeNull(); // empty dimension
        expect(parseFilterParam('success:', allowed)).toBeNull(); // empty value
    });

    it('returns null for a dimension the metric does not support', () => {
        // function_executions has no `model` dimension — e.g. a stale deep-link.
        expect(parseFilterParam('model:gpt-4o', allowed)).toBeNull();
    });
});

describe('isSearchableDimension', () => {
    it('is false for small, fully-listed enum dimensions (no search box)', () => {
        for (const dim of ['environment_id', 'success', 'function_type', 'package', 'callsite'] as const) {
            expect(isSearchableDimension(dim), `${dim} should not be searchable`).toBe(false);
        }
    });

    it('is true for open, high-cardinality id/name dimensions', () => {
        for (const dim of ['integration_id', 'connection_id', 'model', 'function_name'] as const) {
            expect(isSearchableDimension(dim), `${dim} should be searchable`).toBe(true);
        }
    });

    it('classifies every dimension referenced by any metric', () => {
        // Guards against a new dimension silently defaulting to "searchable" without a deliberate choice.
        const referenced = new Set<AnyBreakdownDimension>(Object.values(BREAKDOWN_DIMENSIONS).flat());
        const open = new Set<AnyBreakdownDimension>(['integration_id', 'connection_id', 'model', 'function_name']);
        const closed = new Set<AnyBreakdownDimension>(['environment_id', 'success', 'function_type', 'package', 'callsite']);
        for (const dim of referenced) {
            expect(open.has(dim) || closed.has(dim), `unclassified dimension "${dim}"`).toBe(true);
            expect(isSearchableDimension(dim)).toBe(open.has(dim));
        }
    });
});

describe('breakdownSeriesHref', () => {
    it('links an integration_id series to its integration page', () => {
        expect(breakdownSeriesHref('prod', 'integration_id', 'hubspot')).toBe('/prod/integrations/hubspot');
    });

    it('URL-encodes the provider config key', () => {
        expect(breakdownSeriesHref('prod', 'integration_id', 'my integration/v2')).toBe('/prod/integrations/my%20integration%2Fv2');
    });

    it('returns undefined for every other dimension (not linkable yet)', () => {
        for (const dim of ['connection_id', 'model', 'function_name', 'environment_id', 'success', 'package', 'callsite'] as const) {
            expect(breakdownSeriesHref('prod', dim, 'anything'), `${dim} should not be linkable`).toBeUndefined();
        }
    });
});

describe('breakdownSeriesCopyValue', () => {
    it('offers copy only for connection_id', () => {
        expect(breakdownSeriesCopyValue('connection_id', '5c33f330-7f55-4cbd-a8cc-b091ee3ac15c')).toBe('5c33f330-7f55-4cbd-a8cc-b091ee3ac15c');
    });

    it('returns undefined for every other dimension (no copy button)', () => {
        for (const dim of ['integration_id', 'model', 'function_name', 'function_type', 'success', 'environment_id', 'package', 'callsite'] as const) {
            expect(breakdownSeriesCopyValue(dim, 'anything'), `${dim} should not be copyable`).toBeUndefined();
        }
    });
});

describe('resolveBreakdownDimension', () => {
    it('keeps the group when there is no filter', () => {
        expect(resolveBreakdownDimension('integration_id', null)).toBe('integration_id');
    });

    it('keeps the group when the filter targets a different dimension', () => {
        expect(resolveBreakdownDimension('integration_id', { dimension: 'success' })).toBe('integration_id');
    });

    it('drops the group when the filter targets the same dimension (filter wins)', () => {
        expect(resolveBreakdownDimension('integration_id', { dimension: 'integration_id' })).toBeNull();
    });

    it('returns null when there is no group', () => {
        expect(resolveBreakdownDimension(null, { dimension: 'integration_id' })).toBeNull();
    });
});
