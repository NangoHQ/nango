import { describe, expect, it } from 'vitest';

import { validateCheckpoint } from './checkpoints.js';

describe('validateCheckpoint', () => {
    describe('valid checkpoints', () => {
        it('should validate checkpoint with string values', () => {
            const cp = { cursor: 'abc123', status: 'active' };
            const result = validateCheckpoint(cp);
            expect(result.unwrap()).toEqual(cp);
        });

        it('should validate checkpoint with number values', () => {
            const cp = { page: 5, total: 100 };
            const result = validateCheckpoint(cp);
            expect(result.unwrap()).toEqual(cp);
        });

        it('should validate checkpoint with boolean values', () => {
            const cp = { isComplete: true, hasMore: false };
            const result = validateCheckpoint(cp);
            expect(result.unwrap()).toEqual(cp);
        });

        it('should validate checkpoint with mixed primitive values', () => {
            const cp = { cursor: 'abc123', page: 5, hasMore: true };
            const result = validateCheckpoint(cp);
            expect(result.unwrap()).toEqual(cp);
        });

        it('should validate empty object', () => {
            const result = validateCheckpoint({});
            expect(result.unwrap()).toEqual({});
        });
    });

    describe('invalid checkpoints', () => {
        it('should fail for null', () => {
            expect(validateCheckpoint(null).isErr()).toBe(true);
        });

        it('should fail for undefined', () => {
            expect(validateCheckpoint(undefined).isErr()).toBe(true);
        });

        it('should fail for array', () => {
            expect(validateCheckpoint(['a', 'b']).isErr()).toBe(true);
        });

        it('should fail for primitive values', () => {
            expect(validateCheckpoint('string').isErr()).toBe(true);
            expect(validateCheckpoint(123).isErr()).toBe(true);
            expect(validateCheckpoint(true).isErr()).toBe(true);
        });

        it('should fail for nested objects', () => {
            expect(validateCheckpoint({ nested: { key: 'value' } }).isErr()).toBe(true);
        });

        it('should fail for arrays as values', () => {
            expect(validateCheckpoint({ items: [1, 2, 3] }).isErr()).toBe(true);
        });

        it('should fail for null values', () => {
            expect(validateCheckpoint({ key: null }).isErr()).toBe(true);
        });

        it('should fail for undefined values', () => {
            expect(validateCheckpoint({ key: undefined }).isErr()).toBe(true);
        });

        it('should fail for function values', () => {
            expect(validateCheckpoint({ fn: () => {} }).isErr()).toBe(true);
        });
    });

    describe('date values', () => {
        it('should validate Date values and convert to ISO string', () => {
            const date = new Date('2024-01-15T10:30:00.000Z');
            const result = validateCheckpoint({ lastRun: date });
            expect(result.isOk()).toBe(true);
            expect(result.unwrap()).toEqual({ lastRun: '2024-01-15T10:30:00.000Z' });
        });
    });

    describe('size limits', () => {
        it('should fail for key exceeding 255 characters', () => {
            const longKey = 'a'.repeat(256);
            const result = validateCheckpoint({ [longKey]: 'value' });
            expect(result.isErr()).toBe(true);
        });

        it('should fail for string value exceeding 255 characters', () => {
            const longValue = 'a'.repeat(256);
            const result = validateCheckpoint({ key: longValue });
            expect(result.isErr()).toBe(true);
        });

        it('should fail for more than 16 fields', () => {
            const tooManyFields: Record<string, number> = {};
            for (let i = 0; i < 17; i++) {
                tooManyFields[`field${i}`] = i;
            }
            const result = validateCheckpoint(tooManyFields);
            expect(result.isErr()).toBe(true);
        });
    });
});
