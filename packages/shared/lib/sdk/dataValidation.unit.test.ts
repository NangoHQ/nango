import { beforeEach, describe, expect, it } from 'vitest';
import { clearValidationCache, validateData } from './dataValidation.js';

describe('validateData', () => {
    beforeEach(() => {
        clearValidationCache();
    });

    it('should skip if no json schema ', () => {
        const val = validateData({ version: '1', input: { foo: 'bar' }, modelName: 'Test', jsonSchema: undefined });
        expect(val).toStrictEqual(true);
    });

    it('should return true if no error', () => {
        const val = validateData({
            version: '1',
            input: { foo: 'bar' },
            modelName: 'Test',
            jsonSchema: { definitions: { Test: { type: 'object', properties: { foo: { type: 'string' } } } } }
        });
        expect(val).toStrictEqual(true);
    });

    it('should return an error', () => {
        const val = validateData({
            version: '1',
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
        const val = validateData({
            version: '1',
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
        const val = validateData({
            version: '1',
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

    it('should not throw if invalid json schema', () => {
        const val = validateData({
            version: '1',
            input: { foo: 'bar' },
            modelName: 'Test',
            jsonSchema: {
                definitions: { Test: { type: 'object', properties: { ref: { $ref: '#/definitions/NotFound' } } } }
            }
        });
        // Stringify because it's an exotic error object
        expect(JSON.parse(JSON.stringify(val))).toStrictEqual([{ missingRef: '#/definitions/NotFound', missingSchema: '' }]);
    });

    it('should support exotic format', () => {
        const val = validateData({
            version: '1',
            input: { foo: 'bar' },
            modelName: 'Test',
            jsonSchema: {
                definitions: { Test: { type: 'object', properties: { date: { type: 'string', format: 'date-time' } } } }
            }
        });
        expect(val).toStrictEqual(true);
    });

    it('should handle empty input with model', () => {
        const val = validateData({
            version: '1',
            input: undefined,
            modelName: 'Test',
            jsonSchema: {
                definitions: { Test: { type: 'object', properties: { date: { type: 'string', format: 'date-time' } } } }
            }
        });
        expect(val).toStrictEqual([
            {
                instancePath: '',
                keyword: 'type',
                message: 'must be object',
                params: {
                    type: 'object'
                },
                schemaPath: '#/type'
            }
        ]);
    });

    it('should handle unexpected input', () => {
        const val = validateData({
            version: '1',
            input: '1',
            modelName: undefined,
            jsonSchema: { definitions: {} }
        });
        expect(val).toStrictEqual([
            {
                instancePath: '',
                keyword: 'type',
                message: 'must be empty',
                params: {},
                schemaPath: '#/type'
            }
        ]);
    });

    it('should handle unknown modelName', () => {
        const val = validateData({
            version: '1',
            input: '1',
            modelName: 'Test',
            jsonSchema: { definitions: {} }
        });
        expect(val).toStrictEqual([new Error(`model_not_found_Test`)]);
    });
});
