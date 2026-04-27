import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/api', () => ({ apiFetch: vi.fn() }));

import { buildResultData, computeDurationMs, sleepWithAbort, validateAndParseInputs } from './playground.utils';

import type { InputField } from './types';

function field(overrides: Partial<InputField> & { name: string }): InputField {
    return { type: 'string', required: false, ...overrides };
}

describe('validateAndParseInputs', () => {
    it('parses string fields as-is (preserving raw value)', () => {
        const result = validateAndParseInputs([field({ name: 'foo' })], { foo: 'hello' });
        expect(result).toEqual({ ok: true, parsed: { foo: 'hello' } });
    });

    it('returns error for required empty field', () => {
        const result = validateAndParseInputs([field({ name: 'foo', required: true })], { foo: '' });
        expect(result).toEqual({ ok: false, errors: { foo: 'Required' } });
    });

    it('skips optional empty fields', () => {
        const result = validateAndParseInputs([field({ name: 'foo', required: false })], { foo: '' });
        expect(result).toEqual({ ok: true, parsed: {} });
    });

    it('parses number type', () => {
        const result = validateAndParseInputs([field({ name: 'n', type: 'number' })], { n: '3.14' });
        expect(result).toEqual({ ok: true, parsed: { n: 3.14 } });
    });

    it('rejects invalid number', () => {
        const result = validateAndParseInputs([field({ name: 'n', type: 'number' })], { n: 'abc' });
        expect(result).toEqual({ ok: false, errors: { n: 'Expected a number' } });
    });

    it('parses integer type', () => {
        const result = validateAndParseInputs([field({ name: 'n', type: 'integer' })], { n: '42' });
        expect(result).toEqual({ ok: true, parsed: { n: 42 } });
    });

    it('rejects non-integer for integer type', () => {
        const result = validateAndParseInputs([field({ name: 'n', type: 'integer' })], { n: '3.5' });
        expect(result).toEqual({ ok: false, errors: { n: 'Expected an integer' } });
    });

    it('parses boolean true/false', () => {
        const r1 = validateAndParseInputs([field({ name: 'b', type: 'boolean' })], { b: 'true' });
        expect(r1).toEqual({ ok: true, parsed: { b: true } });
        const r2 = validateAndParseInputs([field({ name: 'b', type: 'boolean' })], { b: 'False' });
        expect(r2).toEqual({ ok: true, parsed: { b: false } });
    });

    it('rejects invalid boolean', () => {
        const result = validateAndParseInputs([field({ name: 'b', type: 'boolean' })], { b: 'yes' });
        expect(result).toEqual({ ok: false, errors: { b: 'Expected true or false' } });
    });

    it('parses object type from JSON', () => {
        const result = validateAndParseInputs([field({ name: 'o', type: 'object' })], { o: '{"a":1}' });
        expect(result).toEqual({ ok: true, parsed: { o: { a: 1 } } });
    });

    it('rejects array for object type', () => {
        const result = validateAndParseInputs([field({ name: 'o', type: 'object' })], { o: '[1]' });
        expect(result).toEqual({ ok: false, errors: { o: 'Expected a JSON object' } });
    });

    it('parses array type from JSON', () => {
        const result = validateAndParseInputs([field({ name: 'a', type: 'array' })], { a: '[1,2]' });
        expect(result).toEqual({ ok: true, parsed: { a: [1, 2] } });
    });

    it('rejects object for array type', () => {
        const result = validateAndParseInputs([field({ name: 'a', type: 'array' })], { a: '{"a":1}' });
        expect(result).toEqual({ ok: false, errors: { a: 'Expected a JSON array' } });
    });

    describe('constraints', () => {
        it('validates enum', () => {
            const f = field({ name: 'e', enum: ['a', 'b'] });
            expect(validateAndParseInputs([f], { e: 'a' })).toEqual({ ok: true, parsed: { e: 'a' } });
            expect(validateAndParseInputs([f], { e: 'c' })).toEqual({ ok: false, errors: { e: 'Must be one of: a, b' } });
        });

        it('validates minLength', () => {
            const f = field({ name: 's', minLength: 3 });
            expect(validateAndParseInputs([f], { s: 'ab' })).toEqual({ ok: false, errors: { s: 'Must be at least 3 characters' } });
            expect(validateAndParseInputs([f], { s: 'abc' })).toEqual({ ok: true, parsed: { s: 'abc' } });
        });

        it('validates maxLength', () => {
            const f = field({ name: 's', maxLength: 2 });
            expect(validateAndParseInputs([f], { s: 'abc' })).toEqual({ ok: false, errors: { s: 'Must be at most 2 characters' } });
        });

        it('validates pattern', () => {
            const f = field({ name: 's', pattern: '^[a-z]+$' });
            expect(validateAndParseInputs([f], { s: 'abc' })).toEqual({ ok: true, parsed: { s: 'abc' } });
            expect(validateAndParseInputs([f], { s: 'ABC' })).toEqual({ ok: false, errors: { s: 'Must match pattern: ^[a-z]+$' } });
        });

        it('validates minimum/maximum for numbers', () => {
            const f = field({ name: 'n', type: 'number', minimum: 1, maximum: 10 });
            expect(validateAndParseInputs([f], { n: '0' })).toEqual({ ok: false, errors: { n: 'Must be ≥ 1' } });
            expect(validateAndParseInputs([f], { n: '11' })).toEqual({ ok: false, errors: { n: 'Must be ≤ 10' } });
            expect(validateAndParseInputs([f], { n: '5' })).toEqual({ ok: true, parsed: { n: 5 } });
        });

        it('validates exclusiveMinimum/exclusiveMaximum', () => {
            const f = field({ name: 'n', type: 'number', exclusiveMinimum: 0, exclusiveMaximum: 10 });
            expect(validateAndParseInputs([f], { n: '0' })).toEqual({ ok: false, errors: { n: 'Must be > 0' } });
            expect(validateAndParseInputs([f], { n: '10' })).toEqual({ ok: false, errors: { n: 'Must be < 10' } });
        });
    });
});

describe('buildResultData', () => {
    it('returns null for null/undefined input', () => {
        expect(buildResultData(null)).toBeNull();
        expect(buildResultData(undefined)).toBeNull();
    });

    it('returns null when no meta/request/response/error', () => {
        expect(buildResultData({})).toBeNull();
    });

    it('spreads meta and includes request/response/error', () => {
        const result = buildResultData({
            meta: { foo: 'bar' },
            request: { url: '/test' },
            response: { status: 200 },
            error: { message: 'oops', payload: { code: 42 } }
        });
        expect(result).toEqual({
            foo: 'bar',
            request: { url: '/test' },
            response: { status: 200 },
            error: { message: 'oops', payload: { code: 42 } }
        });
    });

    it('omits error payload when not present', () => {
        const result = buildResultData({ error: { message: 'fail' } });
        expect(result).toEqual({ error: { message: 'fail' } });
    });

    it('handles meta-only', () => {
        expect(buildResultData({ meta: { k: 'v' } })).toEqual({ k: 'v' });
    });
});

describe('computeDurationMs', () => {
    it('returns durationMs when present', () => {
        expect(computeDurationMs({ durationMs: 500 })).toBe(500);
    });

    it('computes from startedAt/endedAt when durationMs is missing', () => {
        expect(
            computeDurationMs({
                startedAt: '2024-01-01T00:00:00.000Z',
                endedAt: '2024-01-01T00:00:05.000Z'
            })
        ).toBe(5000);
    });

    it('returns fallback when no data available', () => {
        expect(computeDurationMs(null, 123)).toBe(123);
        expect(computeDurationMs({}, 456)).toBe(456);
    });

    it('returns 0 when no data and no fallback', () => {
        expect(computeDurationMs(null)).toBe(0);
        expect(computeDurationMs({})).toBe(0);
    });
});

describe('sleepWithAbort', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('resolves after the specified time', async () => {
        const p = sleepWithAbort(1000, new AbortController().signal);
        await vi.advanceTimersByTimeAsync(1000);
        await expect(p).resolves.toBeUndefined();
    });

    it('rejects with AbortError when aborted during sleep', async () => {
        const controller = new AbortController();
        const p = sleepWithAbort(1000, controller.signal);
        controller.abort();
        await expect(p).rejects.toThrow('Aborted');
    });

    it('rejects immediately for pre-aborted signal', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(sleepWithAbort(1000, controller.signal)).rejects.toThrow('Aborted');
    });
});
