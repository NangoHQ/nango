import { describe, expect, it } from 'vitest';

import { getRecordsRequestParser } from './validate.js';

describe('getRecordsRequestParser.parseQuery', () => {
    const baseQuery = { model: 'foo' };

    it('accepts externalIds as array of strings (normal case)', () => {
        const query = { ...baseQuery, externalIds: ['23591406', '23658002', '23897742'] };
        const result = getRecordsRequestParser.parseQuery(query);
        expect(result.model).toBe('foo');
        expect(result.externalIds).toEqual(['23591406', '23658002', '23897742']);
    });

    it('accepts externalIds as single string', () => {
        const query = { ...baseQuery, externalIds: '23591406' };
        const result = getRecordsRequestParser.parseQuery(query);
        expect(result.externalIds).toEqual(['23591406']);
    });

    it('accepts query without externalIds (optional)', () => {
        const result = getRecordsRequestParser.parseQuery(baseQuery);
        expect(result.externalIds).toBeUndefined();
    });

    it('accepts externalIds as empty array (unchanged)', () => {
        const query = { ...baseQuery, externalIds: [] };
        const result = getRecordsRequestParser.parseQuery(query);
        expect(result.externalIds).toEqual([]);
    });

    it('fails when externalIds is empty string', () => {
        const query = { ...baseQuery, externalIds: '' };
        expect(() => getRecordsRequestParser.parseQuery(query)).toThrow();
    });

    it('fails when externalIds is array of numbers (wrong type)', () => {
        const query = { ...baseQuery, externalIds: [23591406, 23658002] };
        expect(() => getRecordsRequestParser.parseQuery(query)).toThrow();
    });

    it('accepts externalIds as object with >20 keys and normalizes to array (qs arrayLimit)', () => {
        const ids = Array.from({ length: 25 }, (_, i) => `id-${i}`);
        const externalIds = Object.fromEntries(ids.map((id, i) => [String(i), id]));
        const query = { ...baseQuery, externalIds };
        const result = getRecordsRequestParser.parseQuery(query);
        expect(result.externalIds).toHaveLength(25);
        expect(result.externalIds).toEqual(ids);
    });
});
