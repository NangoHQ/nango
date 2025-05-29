import { describe, expect, it } from 'vitest';

import { nangoModelToJsonSchema } from './json-schema.js';

import type { NangoModel, NangoModelField } from '@nangohq/types';

describe('nangoModelToJsonSchema', () => {
    describe('simple models', () => {
        it('should convert a simple model with basic types', () => {
            const model: NangoModel = {
                name: 'User',
                fields: [
                    { name: 'id', value: 'string', optional: false },
                    { name: 'age', value: 'number', optional: false },
                    { name: 'isActive', value: 'boolean', optional: false }
                ]
            };

            const result = nangoModelToJsonSchema(model, []).unwrap();

            expect(result).toEqual({
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    age: { type: 'number' },
                    isActive: { type: 'boolean' }
                },
                required: ['id', 'age', 'isActive']
            });
        });

        it('should handle optional fields', () => {
            const model: NangoModel = {
                name: 'User',
                fields: [
                    { name: 'id', value: 'string', optional: false },
                    { name: 'email', value: 'string', optional: true },
                    { name: 'age', value: 'number', optional: true }
                ]
            };

            const result = nangoModelToJsonSchema(model, []).unwrap();

            expect(result).toEqual({
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    age: { type: 'number' }
                },
                required: ['id']
            });
        });

        it('should default unknown types to string', () => {
            const model: NangoModel = {
                name: 'User',
                fields: [
                    { name: 'id', value: 'uuid', optional: false },
                    { name: 'data', value: 'any', optional: false }
                ]
            };

            const result = nangoModelToJsonSchema(model, []).unwrap();

            expect(result).toEqual({
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    data: { type: 'string' }
                },
                required: ['id', 'data']
            });
        });
    });

    describe('array fields', () => {
        it('should handle array of primitive types', () => {
            const model: NangoModel = {
                name: 'User',
                fields: [
                    { name: 'tags', value: 'string', array: true, optional: false },
                    { name: 'scores', value: 'number', array: true, optional: true }
                ]
            };

            const result = nangoModelToJsonSchema(model, []).unwrap();

            expect(result).toEqual({
                type: 'object',
                properties: {
                    tags: {
                        type: 'array',
                        items: { type: 'string' }
                    },
                    scores: {
                        type: 'array',
                        items: { type: 'number' }
                    }
                },
                required: ['tags']
            });
        });

        it('should handle array of model references', () => {
            const addressModel: NangoModel = {
                name: 'Address',
                fields: [
                    { name: 'street', value: 'string', optional: false },
                    { name: 'city', value: 'string', optional: false }
                ]
            };

            const userModel: NangoModel = {
                name: 'User',
                fields: [{ name: 'addresses', value: 'Address', model: true, array: true, optional: false }]
            };

            const result = nangoModelToJsonSchema(userModel, [addressModel]).unwrap();

            expect(result).toEqual({
                type: 'object',
                properties: {
                    addresses: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                street: { type: 'string' },
                                city: { type: 'string' }
                            },
                            required: ['street', 'city']
                        }
                    }
                },
                required: ['addresses']
            });
        });
    });

    describe('nested models', () => {
        it('should handle nested model references', () => {
            const addressModel: NangoModel = {
                name: 'Address',
                fields: [
                    { name: 'street', value: 'string', optional: false },
                    { name: 'zipCode', value: 'string', optional: true }
                ]
            };

            const userModel: NangoModel = {
                name: 'User',
                fields: [
                    { name: 'name', value: 'string', optional: false },
                    { name: 'address', value: 'Address', model: true, optional: false }
                ]
            };

            const result = nangoModelToJsonSchema(userModel, [addressModel]).unwrap();

            expect(result).toEqual({
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    address: {
                        type: 'object',
                        properties: {
                            street: { type: 'string' },
                            zipCode: { type: 'string' }
                        },
                        required: ['street']
                    }
                },
                required: ['name', 'address']
            });
        });

        it('should handle deeply nested models', () => {
            const countryModel: NangoModel = {
                name: 'Country',
                fields: [
                    { name: 'code', value: 'string', optional: false },
                    { name: 'name', value: 'string', optional: false }
                ]
            };

            const addressModel: NangoModel = {
                name: 'Address',
                fields: [
                    { name: 'street', value: 'string', optional: false },
                    { name: 'country', value: 'Country', model: true, optional: false }
                ]
            };

            const userModel: NangoModel = {
                name: 'User',
                fields: [
                    { name: 'name', value: 'string', optional: false },
                    { name: 'address', value: 'Address', model: true, optional: false }
                ]
            };

            const result = nangoModelToJsonSchema(userModel, [addressModel, countryModel]).unwrap();

            expect(result).toEqual({
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    address: {
                        type: 'object',
                        properties: {
                            street: { type: 'string' },
                            country: {
                                type: 'object',
                                properties: {
                                    code: { type: 'string' },
                                    name: { type: 'string' }
                                },
                                required: ['code', 'name']
                            }
                        },
                        required: ['street', 'country']
                    }
                },
                required: ['name', 'address']
            });
        });
    });

    describe('union types', () => {
        it('should handle union of primitive types', () => {
            const unionField: NangoModelField = {
                name: 'value',
                union: true,
                value: [
                    { name: 'string_option', value: 'string' },
                    { name: 'number_option', value: 'number' }
                ],
                optional: false
            };

            const model: NangoModel = {
                name: 'FlexibleValue',
                fields: [unionField]
            };

            const result = nangoModelToJsonSchema(model, []).unwrap();

            expect(result).toEqual({
                type: 'object',
                properties: {
                    value: {
                        oneOf: [{ type: 'string' }, { type: 'number' }]
                    }
                },
                required: ['value']
            });
        });

        it('should handle union with model references', () => {
            const personModel: NangoModel = {
                name: 'Person',
                fields: [{ name: 'name', value: 'string', optional: false }]
            };

            const companyModel: NangoModel = {
                name: 'Company',
                fields: [{ name: 'companyName', value: 'string', optional: false }]
            };

            const unionField: NangoModelField = {
                name: 'entity',
                union: true,
                value: [
                    { name: 'person_option', value: 'Person', model: true },
                    { name: 'company_option', value: 'Company', model: true }
                ],
                optional: false
            };

            const model: NangoModel = {
                name: 'Contact',
                fields: [unionField]
            };

            const result = nangoModelToJsonSchema(model, [personModel, companyModel]).unwrap();

            expect(result).toEqual({
                type: 'object',
                properties: {
                    entity: {
                        oneOf: [
                            {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' }
                                },
                                required: ['name']
                            },
                            {
                                type: 'object',
                                properties: {
                                    companyName: { type: 'string' }
                                },
                                required: ['companyName']
                            }
                        ]
                    }
                },
                required: ['entity']
            });
        });

        it('should handle union with mixed types and arrays', () => {
            const tagModel: NangoModel = {
                name: 'Tag',
                fields: [{ name: 'label', value: 'string', optional: false }]
            };

            const unionField: NangoModelField = {
                name: 'metadata',
                union: true,
                value: [
                    { name: 'string_option', value: 'string' },
                    { name: 'tags_option', value: 'Tag', model: true, array: true }
                ],
                optional: true
            };

            const model: NangoModel = {
                name: 'Item',
                fields: [{ name: 'id', value: 'string', optional: false }, unionField]
            };

            const result = nangoModelToJsonSchema(model, [tagModel]).unwrap();

            expect(result).toEqual({
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    metadata: {
                        oneOf: [
                            { type: 'string' },
                            {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        label: { type: 'string' }
                                    },
                                    required: ['label']
                                }
                            }
                        ]
                    }
                },
                required: ['id']
            });
        });
    });

    describe('complex combinations', () => {
        it('should handle model with arrays, unions, and nested models', () => {
            const metadataModel: NangoModel = {
                name: 'Metadata',
                fields: [
                    { name: 'key', value: 'string', optional: false },
                    { name: 'value', value: 'string', optional: false }
                ]
            };

            const unionField: NangoModelField = {
                name: 'content',
                union: true,
                value: [
                    { name: 'text_option', value: 'string' },
                    { name: 'number_option', value: 'number' }
                ],
                optional: false
            };

            const complexModel: NangoModel = {
                name: 'ComplexItem',
                fields: [
                    { name: 'id', value: 'string', optional: false },
                    { name: 'tags', value: 'string', array: true, optional: true },
                    { name: 'metadata', value: 'Metadata', model: true, array: true, optional: false },
                    unionField,
                    { name: 'isActive', value: 'boolean', optional: true }
                ]
            };

            const result = nangoModelToJsonSchema(complexModel, [metadataModel]).unwrap();

            expect(result).toEqual({
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    tags: {
                        type: 'array',
                        items: { type: 'string' }
                    },
                    metadata: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                key: { type: 'string' },
                                value: { type: 'string' }
                            },
                            required: ['key', 'value']
                        }
                    },
                    content: {
                        oneOf: [{ type: 'string' }, { type: 'number' }]
                    },
                    isActive: { type: 'boolean' }
                },
                required: ['id', 'metadata', 'content']
            });
        });
    });

    describe('error cases', () => {
        it('should return error when model field references non-existent model', () => {
            const model: NangoModel = {
                name: 'User',
                fields: [{ name: 'profile', value: 'NonExistentModel', model: true, optional: false }]
            };

            const result = nangoModelToJsonSchema(model, []);

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('Model NonExistentModel not found');
            }
        });

        it('should return error when model field value is not a string', () => {
            const model: NangoModel = {
                name: 'User',
                fields: [{ name: 'profile', value: 123, model: true, optional: false } as any]
            };

            const result = nangoModelToJsonSchema(model, []);

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('field is model but value is not a string');
            }
        });

        it('should return error when union field value is not an array', () => {
            const model: NangoModel = {
                name: 'User',
                fields: [{ name: 'data', value: 'string', union: true, optional: false } as any]
            };

            const result = nangoModelToJsonSchema(model, []);

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('field is union but value is not an array');
            }
        });

        it('should return error on circular reference', () => {
            const userModel: NangoModel = {
                name: 'User',
                fields: [
                    { name: 'id', value: 'string', optional: false },
                    { name: 'profile', value: 'Profile', model: true, optional: false }
                ]
            };

            const profileModel: NangoModel = {
                name: 'Profile',
                fields: [
                    { name: 'bio', value: 'string', optional: false },
                    { name: 'user', value: 'User', model: true, optional: false }
                ]
            };

            const result = nangoModelToJsonSchema(userModel, [userModel, profileModel]);

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('Circular reference detected: User -> Profile -> User');
            }
        });

        it('should return error on self-referencing model', () => {
            const treeModel: NangoModel = {
                name: 'TreeNode',
                fields: [
                    { name: 'value', value: 'string', optional: false },
                    { name: 'parent', value: 'TreeNode', model: true, optional: true }
                ]
            };

            const result = nangoModelToJsonSchema(treeModel, [treeModel]);

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('Circular reference detected: TreeNode -> TreeNode');
            }
        });

        it('should return error on complex circular reference chain', () => {
            const aModel: NangoModel = {
                name: 'A',
                fields: [{ name: 'b', value: 'B', model: true, optional: false }]
            };

            const bModel: NangoModel = {
                name: 'B',
                fields: [{ name: 'c', value: 'C', model: true, optional: false }]
            };

            const cModel: NangoModel = {
                name: 'C',
                fields: [{ name: 'a', value: 'A', model: true, optional: false }]
            };

            const result = nangoModelToJsonSchema(aModel, [aModel, bModel, cModel]);

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('Circular reference detected: A -> B -> C -> A');
            }
        });

        it('should return error on circular reference in union types', () => {
            const nodeModel: NangoModel = {
                name: 'Node',
                fields: [
                    { name: 'id', value: 'string', optional: false },
                    {
                        name: 'child',
                        union: true,
                        value: [
                            { name: 'string_option', value: 'string' },
                            { name: 'node_option', value: 'Node', model: true }
                        ],
                        optional: false
                    }
                ]
            };

            const result = nangoModelToJsonSchema(nodeModel, [nodeModel]);

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('Circular reference detected: Node -> Node');
            }
        });

        it('should return error on circular reference in arrays', () => {
            const categoryModel: NangoModel = {
                name: 'Category',
                fields: [
                    { name: 'name', value: 'string', optional: false },
                    { name: 'subcategories', value: 'Category', model: true, array: true, optional: true }
                ]
            };

            const result = nangoModelToJsonSchema(categoryModel, [categoryModel]);

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('Circular reference detected: Category -> Category');
            }
        });
    });

    describe('edge cases', () => {
        it('should handle empty model', () => {
            const model: NangoModel = {
                name: 'Empty',
                fields: []
            };

            const result = nangoModelToJsonSchema(model, []).unwrap();

            expect(result).toEqual({
                type: 'object',
                properties: {},
                required: []
            });
        });

        it('should handle model with all optional fields', () => {
            const model: NangoModel = {
                name: 'AllOptional',
                fields: [
                    { name: 'field1', value: 'string', optional: true },
                    { name: 'field2', value: 'number', optional: true }
                ]
            };

            const result = nangoModelToJsonSchema(model, []).unwrap();

            expect(result).toEqual({
                type: 'object',
                properties: {
                    field1: { type: 'string' },
                    field2: { type: 'number' }
                },
                required: []
            });
        });

        it('should handle non-circular complex nested models', () => {
            const leafModel: NangoModel = {
                name: 'Leaf',
                fields: [{ name: 'value', value: 'string', optional: false }]
            };

            const branchModel: NangoModel = {
                name: 'Branch',
                fields: [
                    { name: 'name', value: 'string', optional: false },
                    { name: 'leaves', value: 'Leaf', model: true, array: true, optional: false }
                ]
            };

            const treeModel: NangoModel = {
                name: 'Tree',
                fields: [
                    { name: 'id', value: 'string', optional: false },
                    { name: 'branches', value: 'Branch', model: true, array: true, optional: false }
                ]
            };

            const result = nangoModelToJsonSchema(treeModel, [treeModel, branchModel, leafModel]).unwrap();

            expect(result.type).toBe('object');
            expect(result.properties?.['id']).toEqual({ type: 'string' });
            expect(result.properties?.['branches']).toEqual({
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        leaves: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    value: { type: 'string' }
                                },
                                required: ['value']
                            }
                        }
                    },
                    required: ['name', 'leaves']
                }
            });
            expect(result.required).toEqual(['id', 'branches']);
        });
    });
});
