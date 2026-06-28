import { describe, expect, it } from 'vitest';

import { enqueuedTaskSchema, searchRulesSchema } from './schemas.js';

describe('searchRulesSchema', () => {
    it('accepts an index rule with a filter', () => {
        const parsed = searchRulesSchema.parse({ records: { filter: 'tenant = 7' } });
        expect(parsed).toEqual({ records: { filter: 'tenant = 7' } });
    });

    it('accepts the wildcard with an empty rule', () => {
        expect(() => searchRulesSchema.parse({ '*': {} })).not.toThrow();
    });

    it('accepts boolean and array rule values', () => {
        expect(() => searchRulesSchema.parse({ a: true, b: ['title'] })).not.toThrow();
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
