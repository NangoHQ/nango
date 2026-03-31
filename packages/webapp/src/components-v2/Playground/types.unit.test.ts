import { describe, expect, it } from 'vitest';

import { getInputFields } from './types.js';

import type { JSONSchema7 } from 'json-schema';

describe('getInputFields', () => {
    it('returns [] for null, undefined, and non-object inputs', () => {
        expect(getInputFields(null)).toEqual([]);
        expect(getInputFields(undefined)).toEqual([]);
        expect(getInputFields('string' as any)).toEqual([]);
    });

    it('returns [] when schema has no properties', () => {
        expect(getInputFields({})).toEqual([]);
        expect(getInputFields({ type: 'object' })).toEqual([]);
    });

    it('maps properties to InputFields with correct types', () => {
        const schema: JSONSchema7 = {
            properties: {
                name: { type: 'string' },
                count: { type: 'number' }
            }
        };
        expect(getInputFields(schema)).toEqual([
            { name: 'name', type: 'string', description: undefined, required: false },
            { name: 'count', type: 'number', description: undefined, required: false }
        ]);
    });

    it('marks fields listed in required as required=true', () => {
        const schema: JSONSchema7 = {
            properties: {
                id: { type: 'string' },
                label: { type: 'string' }
            },
            required: ['id']
        };
        const fields = getInputFields(schema);
        expect(fields.find((f) => f.name === 'id')?.required).toBe(true);
        expect(fields.find((f) => f.name === 'label')?.required).toBe(false);
    });

    it('uses the first non-null type from a union', () => {
        const schema: JSONSchema7 = {
            properties: {
                value: { type: ['null', 'integer'] }
            }
        };
        expect(getInputFields(schema)[0]?.type).toBe('integer');
    });

    it('uses the first type when the union contains no null', () => {
        const schema: JSONSchema7 = {
            properties: {
                value: { type: ['integer', 'string'] }
            }
        };
        expect(getInputFields(schema)[0]?.type).toBe('integer');
    });

    it('skips properties defined as false', () => {
        const schema: JSONSchema7 = {
            properties: {
                allowed: { type: 'string' },
                forbidden: false
            }
        };
        const fields = getInputFields(schema);
        expect(fields).toHaveLength(1);
        expect(fields[0]?.name).toBe('allowed');
    });

    it('includes properties defined as true with type "string" fallback', () => {
        const schema: JSONSchema7 = {
            properties: {
                anything: true
            }
        };
        const fields = getInputFields(schema);
        expect(fields).toHaveLength(1);
        expect(fields[0]).toEqual({ name: 'anything', type: 'string', description: undefined, required: false });
    });

    it('falls back to "string" when type is missing', () => {
        const schema: JSONSchema7 = {
            properties: {
                anything: {}
            }
        };
        expect(getInputFields(schema)[0]?.type).toBe('string');
    });

    it('falls back to "string" when type array is empty', () => {
        const schema: JSONSchema7 = {
            properties: {
                weird: { type: [] }
            }
        };
        expect(getInputFields(schema)[0]?.type).toBe('string');
    });

    it('includes description when present', () => {
        const schema: JSONSchema7 = {
            properties: {
                token: { type: 'string', description: 'API token' }
            }
        };
        expect(getInputFields(schema)[0]?.description).toBe('API token');
    });

    it('treats a non-array required field gracefully (no required marks)', () => {
        const schema = {
            properties: { x: { type: 'string' } },
            required: 'x' // malformed
        } as any;
        expect(getInputFields(schema)[0]?.required).toBe(false);
    });
});
