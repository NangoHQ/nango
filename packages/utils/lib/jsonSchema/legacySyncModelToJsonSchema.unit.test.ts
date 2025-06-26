import { describe, expect, it } from 'vitest';

import { legacySyncModelsToJsonSchema } from './legacySyncModelToJsonSchema.js';

import type { LegacySyncModelSchema } from '@nangohq/types';

describe('legacySyncModelsToJsonSchema', () => {
    it('should handle all primitive types and basic features', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'AllPrimitiveTypes',
                fields: [
                    { name: 'stringField', type: 'string' },
                    { name: 'charField', type: 'char' },
                    { name: 'varcharField', type: 'varchar' },
                    { name: 'numberField', type: 'number' },
                    { name: 'floatField', type: 'float' },
                    { name: 'intField', type: 'int' },
                    { name: 'integerField', type: 'integer' },
                    { name: 'booleanField', type: 'boolean' },
                    { name: 'boolField', type: 'bool' },
                    { name: 'trueField', type: 'true' },
                    { name: 'falseField', type: 'false' },
                    { name: 'dateField', type: 'date' },
                    { name: 'undefinedField', type: 'undefined' },
                    { name: 'nullField', type: 'null' },
                    { name: 'anyField', type: 'any' },
                    { name: 'objectField', type: 'object' },
                    { name: 'arrayField', type: 'array' },
                    { name: 'optionalString', type: 'string | undefined' },
                    { name: 'unknownType', type: 'uuid' }, // Should default to string
                    { name: 'stringArray', type: 'string[]' },
                    { name: 'numberArray', type: 'number[] | undefined' },
                    { name: 'literalUnion', type: 'red | blue' }
                ]
            }
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle references to other models', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'User',
                fields: [
                    { name: 'id', type: 'string' },
                    { name: 'profile', type: 'Profile' },
                    { name: 'roles', type: 'Role[]' }
                ]
            },
            {
                name: 'Profile',
                fields: [
                    { name: 'bio', type: 'string' },
                    { name: 'avatar', type: 'string | null' }
                ]
            },
            {
                name: 'Role',
                fields: [{ name: 'name', type: 'string' }]
            }
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle unions and optionals', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'Event',
                fields: [
                    { name: 'id', type: 'string' },
                    { name: 'status', type: 'active | canceled' },
                    { name: 'maybeString', type: 'string | null | undefined' },
                    { name: 'maybeModel', type: 'Profile | null' }
                ]
            },
            {
                name: 'Profile',
                fields: [{ name: 'bio', type: 'string' }]
            }
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle arrays of models and primitives', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'Document',
                fields: [
                    { name: 'id', type: 'string' },
                    { name: 'tags', type: 'string[]' },
                    { name: 'collaborators', type: 'User[] | undefined' }
                ]
            },
            {
                name: 'User',
                fields: [
                    { name: 'id', type: 'string' },
                    { name: 'email', type: 'string' }
                ]
            }
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle empty models array', () => {
        const models: LegacySyncModelSchema[] = [];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle model with no fields', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'EmptyModel',
                fields: []
            }
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should not reference a non-existent model', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'HasMissingRef',
                fields: [
                    { name: 'id', type: 'string' },
                    { name: 'missing', type: 'NonExistentModel' }
                ]
            }
        ];
        const result = legacySyncModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });
});
