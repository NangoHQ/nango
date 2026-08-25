import { describe, expect, it } from 'vitest';

import { BREAKDOWN_DIMENSIONS, isAllowedDimensionFor } from './clickhouse.query.js';

import type { UsageMetric } from '@nangohq/types';

describe('isAllowedDimensionFor', () => {
    it('accepts every per-metric dim in BREAKDOWN_DIMENSIONS plus "none" for every metric', () => {
        for (const metric of Object.keys(BREAKDOWN_DIMENSIONS) as UsageMetric[]) {
            expect(isAllowedDimensionFor(metric, 'none')).toBe(true);
            for (const dim of BREAKDOWN_DIMENSIONS[metric]) {
                expect(isAllowedDimensionFor(metric, dim)).toBe(true);
            }
        }
    });

    it('rejects dims from a different metric (e.g. proxy + model)', () => {
        expect(isAllowedDimensionFor('proxy', 'model')).toBe(false);
        expect(isAllowedDimensionFor('connections', 'function_name')).toBe(false);
        expect(isAllowedDimensionFor('connections', 'connection_id')).toBe(false);
        expect(isAllowedDimensionFor('proxy', 'function_type')).toBe(false);
    });

    it('rejects strings outside any allowlist (SQL injection guard)', () => {
        expect(isAllowedDimensionFor('proxy', '')).toBe(false);
        expect(isAllowedDimensionFor('proxy', '1; DROP TABLE users--')).toBe(false);
        expect(isAllowedDimensionFor('proxy', 'account_id')).toBe(false);
        expect(isAllowedDimensionFor('records', 'NONE')).toBe(false);
        expect(isAllowedDimensionFor('records', ' none ')).toBe(false);
    });
});
