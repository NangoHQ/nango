import { describe, expect, it } from 'vitest';
import { validateInput } from './dataValidation.js';

describe('validateInput', () => {
    it('should skip if no json schema ', () => {
        const val = validateInput({ input: { foo: 'bar' }, modelName: 'Test', jsonSchema: undefined });
        expect(val).toStrictEqual(true);
    });

    it('should return true if no error', () => {
        const val = validateInput({
            input: { foo: 'bar' },
            modelName: 'Test',
            jsonSchema: { definitions: { Test: { type: 'object', properties: { foo: { type: 'string' } } } } }
        });
        expect(val).toStrictEqual(true);
    });

    it('should return an error', () => {
        const val = validateInput({
            input: { foo: 'bar' },
            modelName: 'Test',
            jsonSchema: {
                definitions: { Test: { type: 'object', properties: { foo: { type: 'number' } }, required: ['foo'], additionalProperties: false } }
            }
        });
        expect(val).toStrictEqual([
            { instancePath: '/foo', keyword: 'type', message: 'must be number', params: { type: 'number' }, schemaPath: '#/properties/foo/type' }
        ]);
    });

    it('should support ref', () => {
        const val = validateInput({
            input: { ref: { id: 'bar' } },
            modelName: 'Test1',
            jsonSchema: {
                definitions: {
                    Test1: { type: 'object', properties: { ref: { $ref: '#/definitions/Test2' } }, required: ['ref'], additionalProperties: false },
                    Test2: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }
                }
            }
        });
        expect(val).toStrictEqual(true);
    });

    it('should support ref error', () => {
        const val = validateInput({
            input: { ref: { id: 1 } },
            modelName: 'Test1',
            jsonSchema: {
                definitions: {
                    Test1: { type: 'object', properties: { ref: { $ref: '#/definitions/Test2' } }, required: ['ref'], additionalProperties: false },
                    Test2: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }
                }
            }
        });
        expect(val).toStrictEqual([
            {
                instancePath: '/ref/id',
                keyword: 'type',
                message: 'must be string',
                params: { type: 'string' },
                schemaPath: '#/definitions/Test2/properties/id/type'
            }
        ]);
    });
});
