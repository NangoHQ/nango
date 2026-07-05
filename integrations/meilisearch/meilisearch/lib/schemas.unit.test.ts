import { describe, expect, it } from 'vitest';

import { enqueuedTaskSchema, filterSchema, searchRulesSchema } from './schemas.js';

describe('searchRulesSchema', () => {
    it('accepts an index rule with a filter', () => {
        const parsed = searchRulesSchema.parse({ records: { filter: 'tenant = 7' } });
        expect(parsed).toEqual({ records: { filter: 'tenant = 7' } });
    });

    it('accepts the wildcard with an empty rule', () => {
        expect(() => searchRulesSchema.parse({ '*': {} })).not.toThrow();
    });

    it('accepts null rule values (no restriction)', () => {
        expect(() => searchRulesSchema.parse({ '*': null })).not.toThrow();
    });

    it('rejects boolean, array, and number rule values', () => {
        expect(() => searchRulesSchema.parse({ a: true })).toThrow();
        expect(() => searchRulesSchema.parse({ a: ['title'] })).toThrow();
        expect(() => searchRulesSchema.parse({ a: 123 })).toThrow();
    });
});

describe('filterSchema', () => {
    it('accepts a string filter', () => {
        expect(() => filterSchema.parse('patient_id = 42')).not.toThrow();
    });

    it('accepts a flat array of strings', () => {
        expect(() => filterSchema.parse(['a = 1', 'b = 2'])).not.toThrow();
    });

    it('accepts nested arrays (OR-of-ANDs)', () => {
        expect(() => filterSchema.parse([['genres = horror', 'genres = comedy'], 'release_date > 795484800'])).not.toThrow();
    });

    it('rejects non-string leaves', () => {
        expect(() => filterSchema.parse([[1, 2]])).toThrow();
    });
});

describe('enqueuedTaskSchema', () => {
    it('parses an enqueued task', () => {
        const parsed = enqueuedTaskSchema.parse({
            taskUid: 12,
            indexUid: 'records',
            status: 'enqueued',
            type: 'documentAdditionOrUpdate',
            enqueuedAt: '2026-06-28T00:00:00Z'
        });
        expect(parsed.taskUid).toBe(12);
    });
});
