import { describe, expect, it } from 'vitest';

import { nangoModelsToJsonSchema } from './nangoModelToJsonSchema.js';

import type { NangoModel } from '@nangohq/types';

describe('nangoModelsToJsonSchema', () => {
    it('should handle all primitive types and basic features', () => {
        const models: NangoModel[] = [
            {
                name: 'AllPrimitiveTypes',
                fields: [
                    { name: 'stringField', value: 'string', tsType: true, optional: false },
                    { name: 'numberField', value: 'number', tsType: true, optional: false },
                    { name: 'booleanField', value: 'boolean', tsType: true, optional: false },
                    { name: 'dateField', value: 'date', tsType: true, optional: false },
                    { name: 'optionalString', value: 'string', tsType: true, optional: true },
                    { name: 'unknownType', value: 'uuid', tsType: true, optional: false }, // Should default to string record
                    { name: 'stringArray', value: 'string', tsType: true, array: true, optional: false },
                    { name: 'numberArray', value: 'number', tsType: true, array: true, optional: true }
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
                    { name: 'street', value: 'string', tsType: true, optional: false },
                    { name: 'city', value: 'string', tsType: true, optional: false },
                    { name: 'zipCode', value: 'string', tsType: true, optional: true }
                ]
            },
            {
                name: 'Country',
                fields: [
                    { name: 'code', value: 'string', tsType: true, optional: false },
                    { name: 'name', value: 'string', tsType: true, optional: false }
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
                    { name: 'name', value: 'string', tsType: true, optional: false },
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
                    { name: 'id', value: 'string', tsType: true, optional: false },
                    { name: 'name', value: 'string', tsType: true, optional: false },
                    { name: 'parentCategory', value: 'Category', model: true, optional: true },
                    { name: 'subcategories', value: 'Category', model: true, array: true, optional: true }
                ]
            },
            {
                name: 'Post',
                fields: [
                    { name: 'id', value: 'string', tsType: true, optional: false },
                    { name: 'title', value: 'string', tsType: true, optional: false },
                    { name: 'author', value: 'User', model: true, optional: false },
                    { name: 'comments', value: 'Comment', model: true, array: true, optional: true }
                ]
            },
            {
                name: 'Comment',
                fields: [
                    { name: 'id', value: 'string', tsType: true, optional: false },
                    { name: 'content', value: 'string', tsType: true, optional: false },
                    { name: 'author', value: 'User', model: true, optional: false },
                    { name: 'post', value: 'Post', model: true, optional: false },
                    { name: 'replies', value: 'Comment', model: true, array: true, optional: true }
                ]
            },
            {
                name: 'User',
                fields: [
                    { name: 'id', value: 'string', tsType: true, optional: false },
                    { name: 'username', value: 'string', tsType: true, optional: false },
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
                    { name: 'name', value: 'string', tsType: true, optional: false },
                    { name: 'age', value: 'number', tsType: true, optional: false }
                ]
            },
            {
                name: 'Company',
                fields: [
                    { name: 'companyName', value: 'string', tsType: true, optional: false },
                    { name: 'employees', value: 'number', tsType: true, optional: false }
                ]
            },
            {
                name: 'Tag',
                fields: [
                    { name: 'label', value: 'string', tsType: true, optional: false },
                    { name: 'color', value: 'string', tsType: true, optional: true }
                ]
            },
            {
                name: 'FlexibleEntity',
                fields: [
                    { name: 'id', value: 'string', tsType: true, optional: false },
                    // Union of primitive types
                    {
                        name: 'primitiveUnion',
                        union: true,
                        value: [
                            { name: 'string_option', value: 'string', tsType: true },
                            { name: 'number_option', value: 'number', tsType: true },
                            { name: 'boolean_option', value: 'boolean', tsType: true }
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
                            { name: 'string_option', value: 'string', tsType: true },
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
                    { name: 'key', value: 'string', tsType: true, optional: false },
                    { name: 'value', value: 'string', tsType: true, optional: false }
                ]
            },
            {
                name: 'ArrayShowcase',
                fields: [
                    { name: 'id', value: 'string', tsType: true, optional: false },
                    // Array of primitives
                    { name: 'tags', value: 'string', array: true, tsType: true, optional: false },
                    { name: 'scores', value: 'number', array: true, tsType: true, optional: true },
                    // Array of models
                    { name: 'metadata', value: 'Metadata', model: true, array: true, optional: false },
                    // Array with union types
                    {
                        name: 'flexibleArray',
                        array: true,
                        union: true,
                        value: [
                            { name: 'string_option', value: 'string', tsType: true },
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

    it('should handle nested objects', () => {
        const models: NangoModel[] = [
            {
                name: 'LinearTeamBase',
                fields: [
                    { name: 'id', value: 'string', tsType: true, optional: false },
                    { name: 'name', value: 'string', tsType: true, optional: false }
                ]
            },
            {
                name: 'TeamsPaginatedResponse',
                fields: [
                    {
                        name: 'teams',
                        array: true,
                        model: true,
                        value: 'LinearTeamBase',
                        optional: false
                    },
                    {
                        name: 'pageInfo',
                        optional: false,
                        value: [
                            {
                                name: 'hasNextPage',
                                array: false,
                                value: 'boolean',
                                tsType: true,
                                optional: false
                            },
                            {
                                name: 'endCursor',
                                union: true,
                                value: [
                                    {
                                        name: '0',
                                        array: false,
                                        value: 'string',
                                        tsType: true,
                                        optional: false
                                    },
                                    {
                                        name: '1',
                                        array: false,
                                        value: null,
                                        optional: false
                                    }
                                ],
                                optional: false
                            }
                        ]
                    }
                ]
            }
        ];

        const result = nangoModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle arrays of nested models', () => {
        /**
         * This originates from the following nango.yaml model:
         *
         * ModelWithNestedModelArray:
         *   nestedModels:
         *     - firstName: string
         *       lastName: string
         *
         *  It's supposed to mean: an array of an object with a firstName and lastName field.
         */
        const models: NangoModel[] = [
            {
                name: 'ModelWithNestedModelArray',
                fields: [
                    {
                        name: 'nestedModels',
                        array: true, // We will identify this case by: It's an array with the first object named '0'
                        value: [
                            {
                                name: '0',
                                value: [
                                    {
                                        name: 'firstName',
                                        value: 'string',
                                        tsType: true,
                                        optional: false
                                    },
                                    {
                                        name: 'lastName',
                                        value: 'string',
                                        tsType: true,
                                        optional: false
                                    }
                                ]
                            }
                        ],
                        optional: false
                    }
                ]
            }
        ];

        const result = nangoModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle dynamic fields', () => {
        const models: NangoModel[] = [
            {
                name: 'DynamicFields',
                fields: [{ name: 'fields', array: true, model: true, value: 'Field', optional: false }]
            },
            {
                name: 'Field',
                fields: [
                    {
                        name: '__string',
                        union: true,
                        value: [
                            { name: '0', array: false, model: true, value: 'Field', optional: false },
                            { name: '1', array: false, value: 'string', tsType: true, optional: false }
                        ],
                        dynamic: true,
                        optional: false
                    }
                ]
            }
        ];

        const result = nangoModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });

    it('should handle literals', () => {
        const models: NangoModel[] = [
            {
                name: 'Literals',
                fields: [
                    { name: 'literalString', value: 'nango', optional: false },
                    {
                        name: 'truth',
                        value: true,
                        optional: false
                    },
                    {
                        name: 'lie',
                        value: false,
                        optional: false
                    },
                    {
                        name: 'someSpecificNumber',
                        value: 1,
                        optional: false
                    }
                ]
            }
        ];

        const result = nangoModelsToJsonSchema(models);
        expect(result).toMatchSnapshot();
    });
});
