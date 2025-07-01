import { describe, expect, it } from 'vitest';

import { legacySyncModelsToJsonSchema, nangoModelsToJsonSchema } from './json-schema.js';

import type { LegacySyncModelSchema, NangoModel } from '@nangohq/types';

describe('nangoModelsToJsonSchema', () => {
    it('should handle all primitive types and basic features', () => {
        const models: NangoModel[] = [
            {
                name: 'AllPrimitiveTypes',
                fields: [
                    { name: 'stringField', value: 'string', optional: false },
                    { name: 'numberField', value: 'number', optional: false },
                    { name: 'booleanField', value: 'boolean', optional: false },
                    { name: 'dateField', value: 'date', optional: false },
                    { name: 'optionalString', value: 'string', optional: true },
                    { name: 'unknownType', value: 'uuid', optional: false }, // Should default to string record
                    { name: 'stringArray', value: 'string', array: true, optional: false },
                    { name: 'numberArray', value: 'number', array: true, optional: true }
                ]
            }
        ];

        const result = nangoModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle nested model references', () => {
        const models: NangoModel[] = [
            {
                name: 'Address',
                fields: [
                    { name: 'street', value: 'string', optional: false },
                    { name: 'city', value: 'string', optional: false },
                    { name: 'zipCode', value: 'string', optional: true }
                ]
            },
            {
                name: 'Country',
                fields: [
                    { name: 'code', value: 'string', optional: false },
                    { name: 'name', value: 'string', optional: false }
                ]
            },
            {
                name: 'DetailedAddress',
                fields: [
                    { name: 'address', value: 'Address', model: true, optional: false },
                    { name: 'country', value: 'Country', model: true, optional: false }
                ]
            },
            {
                name: 'User',
                fields: [
                    { name: 'name', value: 'string', optional: false },
                    { name: 'primaryAddress', value: 'DetailedAddress', model: true, optional: false },
                    { name: 'addresses', value: 'Address', model: true, array: true, optional: true }
                ]
            }
        ];

        const result = nangoModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle circular model references', () => {
        const models: NangoModel[] = [
            {
                name: 'Category',
                fields: [
                    { name: 'id', value: 'string', optional: false },
                    { name: 'name', value: 'string', optional: false },
                    { name: 'parentCategory', value: 'Category', model: true, optional: true },
                    { name: 'subcategories', value: 'Category', model: true, array: true, optional: true }
                ]
            },
            {
                name: 'Post',
                fields: [
                    { name: 'id', value: 'string', optional: false },
                    { name: 'title', value: 'string', optional: false },
                    { name: 'author', value: 'User', model: true, optional: false },
                    { name: 'comments', value: 'Comment', model: true, array: true, optional: true }
                ]
            },
            {
                name: 'Comment',
                fields: [
                    { name: 'id', value: 'string', optional: false },
                    { name: 'content', value: 'string', optional: false },
                    { name: 'author', value: 'User', model: true, optional: false },
                    { name: 'post', value: 'Post', model: true, optional: false },
                    { name: 'replies', value: 'Comment', model: true, array: true, optional: true }
                ]
            },
            {
                name: 'User',
                fields: [
                    { name: 'id', value: 'string', optional: false },
                    { name: 'username', value: 'string', optional: false },
                    { name: 'posts', value: 'Post', model: true, array: true, optional: true },
                    { name: 'comments', value: 'Comment', model: true, array: true, optional: true }
                ]
            }
        ];

        const result = nangoModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle unions with primitives and models', () => {
        const models: NangoModel[] = [
            {
                name: 'Person',
                fields: [
                    { name: 'name', value: 'string', optional: false },
                    { name: 'age', value: 'number', optional: false }
                ]
            },
            {
                name: 'Company',
                fields: [
                    { name: 'companyName', value: 'string', optional: false },
                    { name: 'employees', value: 'number', optional: false }
                ]
            },
            {
                name: 'Tag',
                fields: [
                    { name: 'label', value: 'string', optional: false },
                    { name: 'color', value: 'string', optional: true }
                ]
            },
            {
                name: 'FlexibleEntity',
                fields: [
                    { name: 'id', value: 'string', optional: false },
                    // Union of primitive types
                    {
                        name: 'primitiveUnion',
                        union: true,
                        value: [
                            { name: 'string_option', value: 'string' },
                            { name: 'number_option', value: 'number' },
                            { name: 'boolean_option', value: 'boolean' }
                        ],
                        optional: false
                    },
                    // Union of model references
                    {
                        name: 'entityUnion',
                        union: true,
                        value: [
                            { name: 'person_option', value: 'Person', model: true },
                            { name: 'company_option', value: 'Company', model: true }
                        ],
                        optional: false
                    },
                    // Union with arrays
                    {
                        name: 'mixedUnion',
                        union: true,
                        value: [
                            { name: 'string_option', value: 'string' },
                            { name: 'tags_array_option', value: 'Tag', model: true, array: true }
                        ],
                        optional: true
                    }
                ]
            }
        ];

        const result = nangoModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle complex arrays with nested structures', () => {
        const models: NangoModel[] = [
            {
                name: 'Metadata',
                fields: [
                    { name: 'key', value: 'string', optional: false },
                    { name: 'value', value: 'string', optional: false }
                ]
            },
            {
                name: 'ArrayShowcase',
                fields: [
                    { name: 'id', value: 'string', optional: false },
                    // Array of primitives
                    { name: 'tags', value: 'string', array: true, optional: false },
                    { name: 'scores', value: 'number', array: true, optional: true },
                    // Array of models
                    { name: 'metadata', value: 'Metadata', model: true, array: true, optional: false },
                    // Array with union types
                    {
                        name: 'flexibleArray',
                        array: true,
                        union: true,
                        value: [
                            { name: 'string_option', value: 'string' },
                            { name: 'metadata_option', value: 'Metadata', model: true }
                        ],
                        optional: true
                    }
                ]
            }
        ];

        const result = nangoModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle empty models array', () => {
        const models: NangoModel[] = [];
        const result = nangoModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle model with no fields', () => {
        const models: NangoModel[] = [
            {
                name: 'EmptyModel',
                fields: []
            }
        ];

        const result = nangoModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });
});

describe('legacySyncModelsToJsonSchema', () => {
    it('should handle all primitive types and basic features', () => {
        const models: LegacySyncModelSchema[] = [
            {
                name: 'AllPrimitiveTypes',
                fields: [
                    { name: 'stringField', type: 'string' },
                    { name: 'numberField', type: 'number' },
                    { name: 'booleanField', type: 'boolean' },
                    { name: 'dateField', type: 'date' },
                    { name: 'optionalString', type: 'string | undefined' },
                    { name: 'unknownType', type: 'uuid' }, // Should default to string
                    { name: 'stringArray', type: 'string[]' },
                    { name: 'numberArray', type: 'number[] | undefined' }
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

    it('should still reference a non-existent model', () => {
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
