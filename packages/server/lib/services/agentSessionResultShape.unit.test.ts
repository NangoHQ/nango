import { describe, expect, it } from 'vitest';

import { describeResult, describeShape } from './agentSessionResultShape.js';

describe('describeShape', () => {
    it('outlines arrays of objects with lengths, optional keys, dates and long strings', () => {
        const value = {
            emails: [
                { id: 'msg_0', date: '2026-11-01T00:00:00.000Z', body: 'x'.repeat(1_000), labels: ['inbox'] },
                { id: 'msg_1', date: '2026-11-02T00:00:00.000Z', body: 'y'.repeat(1_000), cc: null }
            ],
            next_cursor: null
        };

        expect(describeShape(value)).toBe(`{
  emails: {
    id: string;
    date: string /* ISO date */;
    body: string /* ~1000 chars */;
    labels?: string[] /* 1 items */;
    cc?: null;
  }[] /* 2 items */;
  next_cursor: null;
}`);
    });

    it('unions mixed types and wraps union items in parentheses', () => {
        expect(describeShape([1, 'a', null])).toBe('(string | number | null)[] /* 3 items */');
        expect(describeShape({ 'weird key': 1 })).toBe('{\n  "weird key": number;\n}');
    });

    it('caps very wide objects', () => {
        const wide = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]));
        expect(describeShape(wide)).toContain('/* 10 more keys */');
    });
});

describe('describeResult', () => {
    it('samples the first items and clips long strings', () => {
        const { sample } = describeResult({ items: Array.from({ length: 10 }, (_, i) => ({ i, text: 'z'.repeat(500) })) });
        expect(sample).toEqual({
            items: [{ i: 0, text: `${'z'.repeat(120)}… (500 chars)` }, { i: 1, text: `${'z'.repeat(120)}… (500 chars)` }, '… 8 more items']
        });
    });
});
