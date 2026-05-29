import { describe, expect, it } from 'vitest';

import { BREAKDOWN_DIMENSIONS, isAllowedDimension } from './clickhouse.query.js';

describe('isAllowedDimension', () => {
    it('accepts every dim listed in BREAKDOWN_DIMENSIONS plus "none"', () => {
        expect(isAllowedDimension('none')).toBe(true);
        for (const dims of Object.values(BREAKDOWN_DIMENSIONS)) {
            for (const dim of dims) {
                expect(isAllowedDimension(dim)).toBe(true);
            }
        }
    });

    it('rejects strings outside the allowlist (SQL injection guard)', () => {
        expect(isAllowedDimension('')).toBe(false);
        expect(isAllowedDimension('1; DROP TABLE users--')).toBe(false);
        expect(isAllowedDimension('account_id')).toBe(false);
        expect(isAllowedDimension('NoneOf-the-above')).toBe(false);
        expect(isAllowedDimension('NONE')).toBe(false);
        expect(isAllowedDimension(' none ')).toBe(false);
    });
});
