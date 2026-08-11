import { describe, expect, it } from 'vitest';

import { changedFields, makeAuditTarget, toAuditId } from './audit.js';

describe('audit utilities', () => {
    describe('toAuditId', () => {
        it.each([
            { value: 'github', expected: 'github' },
            { value: 42, expected: '42' },
            { value: '', expected: undefined },
            { value: null, expected: undefined }
        ])('converts $value to $expected', ({ value, expected }) => {
            expect(toAuditId(value)).toBe(expected);
        });
    });

    describe('makeAuditTarget', () => {
        it('creates a target with an optional display name', () => {
            expect(makeAuditTarget('integration', 'github', 'GitHub')).toStrictEqual({ type: 'integration', id: 'github', display: 'GitHub' });
        });

        it('returns undefined when the value cannot identify a target', () => {
            expect(makeAuditTarget('integration', undefined)).toBeUndefined();
        });
    });

    describe('changedFields', () => {
        it('returns field names without inspecting their values', () => {
            expect(changedFields({ credentials: { client_secret: 'secret' }, custom: 'private' })).toStrictEqual(['credentials', 'custom']);
        });

        it('filters long keys and limits the number of fields', () => {
            const value: Record<string, unknown> = { ['x'.repeat(65)]: true };
            for (let index = 0; index < 31; index++) {
                value[`field_${index}`] = index;
            }

            expect(changedFields(value)).toStrictEqual(Array.from({ length: 30 }, (_, index) => `field_${index}`));
        });

        it.each([undefined, null, '', []])('returns undefined for an empty or non-object value', (value) => {
            expect(changedFields(value)).toBeUndefined();
        });
    });
});
