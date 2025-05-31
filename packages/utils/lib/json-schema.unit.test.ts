import { describe, expect, it } from 'vitest';

import { pickRelevantJsonSchemaDefinitions } from './json-schema.js';

import type { JSONSchema7 } from 'json-schema';

describe('pickRelevantJsonSchemaDefinitions', () => {
    // Base reusable schemas
    const baseUserSchema: JSONSchema7 = {
        type: 'object',
        properties: {
            id: { type: 'string' },
            name: { type: 'string' }
        }
    };

    const basePostSchema: JSONSchema7 = {
        type: 'object',
        properties: {
            title: { type: 'string' },
            content: { type: 'string' }
        }
    };

    const baseProfileSchema: JSONSchema7 = {
        type: 'object',
        properties: {
            bio: { type: 'string' },
            avatar: { type: 'string' }
        }
    };

    const baseAddressSchema: JSONSchema7 = {
        type: 'object',
        properties: {
            street: { type: 'string' },
            city: { type: 'string' }
        }
    };

    describe('basic functionality', () => {
        it('should return empty object when jsonSchema has no definitions', () => {
            const jsonSchema: JSONSchema7 = {};
            const models = ['User'];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({});
            }
        });

        it('should return empty object when models array is empty', () => {
            const jsonSchema: JSONSchema7 = {
                definitions: { User: baseUserSchema }
            };
            const models: string[] = [];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({ definitions: {} });
            }
        });

        it('should extract single model definition', () => {
            const jsonSchema: JSONSchema7 = {
                definitions: {
                    User: baseUserSchema,
                    Post: basePostSchema
                }
            };
            const models = ['User'];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({
                    definitions: { User: baseUserSchema }
                });
            }
        });

        it('should extract multiple model definitions', () => {
            const commentSchema: JSONSchema7 = {
                type: 'object',
                properties: { text: { type: 'string' } }
            };

            const jsonSchema: JSONSchema7 = {
                definitions: {
                    User: baseUserSchema,
                    Post: basePostSchema,
                    Comment: commentSchema
                }
            };
            const models = ['User', 'Post'];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({
                    definitions: {
                        User: baseUserSchema,
                        Post: basePostSchema
                    }
                });
            }
        });
    });

    describe('error cases', () => {
        it('should return error when model does not exist in definitions', () => {
            const jsonSchema: JSONSchema7 = {
                definitions: { User: baseUserSchema }
            };
            const models = ['NonExistentModel'];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('json_schema doesn\'t contain model "NonExistentModel"');
            }
        });

        it('should return error when referenced model does not exist', () => {
            const userWithMissingRef: JSONSchema7 = {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    profile: { $ref: '#/definitions/Profile' } // Profile doesn't exist
                }
            };

            const jsonSchema: JSONSchema7 = {
                definitions: { User: userWithMissingRef }
            };
            const models = ['User'];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isErr()).toBe(true);
            if (result.isErr()) {
                expect(result.error.message).toBe('json_schema doesn\'t contain model "Profile"');
            }
        });
    });

    describe('schema references', () => {
        it('should include referenced models from properties', () => {
            const userWithProfile: JSONSchema7 = {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    profile: { $ref: '#/definitions/Profile' }
                }
            };

            const jsonSchema: JSONSchema7 = {
                definitions: {
                    User: userWithProfile,
                    Profile: baseProfileSchema,
                    Post: basePostSchema
                }
            };
            const models = ['User'];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({
                    definitions: {
                        User: userWithProfile,
                        Profile: baseProfileSchema
                    }
                });
            }
        });

        it('should handle nested references', () => {
            const userWithProfile: JSONSchema7 = {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    profile: { $ref: '#/definitions/Profile' }
                }
            };

            const profileWithAddress: JSONSchema7 = {
                type: 'object',
                properties: {
                    bio: { type: 'string' },
                    address: { $ref: '#/definitions/Address' }
                }
            };

            const jsonSchema: JSONSchema7 = {
                definitions: {
                    User: userWithProfile,
                    Profile: profileWithAddress,
                    Address: baseAddressSchema
                }
            };
            const models = ['User'];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({
                    definitions: {
                        User: userWithProfile,
                        Profile: profileWithAddress,
                        Address: baseAddressSchema
                    }
                });
            }
        });

        it('should handle array item references', () => {
            const userWithPosts: JSONSchema7 = {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    posts: {
                        type: 'array',
                        items: { $ref: '#/definitions/Post' }
                    }
                }
            };

            const jsonSchema: JSONSchema7 = {
                definitions: {
                    User: userWithPosts,
                    Post: basePostSchema
                }
            };
            const models = ['User'];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({
                    definitions: {
                        User: userWithPosts,
                        Post: basePostSchema
                    }
                });
            }
        });

        it('should handle array of items references', () => {
            const userWithMixedData: JSONSchema7 = {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    data: {
                        type: 'array',
                        items: [{ $ref: '#/definitions/Post' }, { $ref: '#/definitions/Comment' }]
                    }
                }
            };

            const commentSchema: JSONSchema7 = {
                type: 'object',
                properties: { text: { type: 'string' } }
            };

            const jsonSchema: JSONSchema7 = {
                definitions: {
                    User: userWithMixedData,
                    Post: basePostSchema,
                    Comment: commentSchema
                }
            };
            const models = ['User'];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({
                    definitions: {
                        User: userWithMixedData,
                        Post: basePostSchema,
                        Comment: commentSchema
                    }
                });
            }
        });

        it('should handle oneOf, anyOf, and allOf references', () => {
            const userWithOneOf: JSONSchema7 = {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    contact: {
                        oneOf: [{ $ref: '#/definitions/Email' }, { $ref: '#/definitions/Phone' }]
                    }
                }
            };

            const userWithAnyOf: JSONSchema7 = {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    data: {
                        anyOf: [{ $ref: '#/definitions/PublicData' }, { $ref: '#/definitions/PrivateData' }]
                    }
                }
            };

            const userWithAllOf: JSONSchema7 = {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    profile: {
                        allOf: [{ $ref: '#/definitions/BasicInfo' }, { $ref: '#/definitions/ContactInfo' }]
                    }
                }
            };

            // Test oneOf
            const emailSchema: JSONSchema7 = { type: 'object', properties: { email: { type: 'string' } } };
            const phoneSchema: JSONSchema7 = { type: 'object', properties: { phone: { type: 'string' } } };

            let jsonSchema: JSONSchema7 = {
                definitions: { User: userWithOneOf, Email: emailSchema, Phone: phoneSchema }
            };

            let result = pickRelevantJsonSchemaDefinitions(jsonSchema, ['User']);
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value.definitions).toEqual({
                    User: userWithOneOf,
                    Email: emailSchema,
                    Phone: phoneSchema
                });
            }

            // Test anyOf
            const publicDataSchema: JSONSchema7 = { type: 'object', properties: { name: { type: 'string' } } };
            const privateDataSchema: JSONSchema7 = { type: 'object', properties: { ssn: { type: 'string' } } };

            jsonSchema = {
                definitions: { User: userWithAnyOf, PublicData: publicDataSchema, PrivateData: privateDataSchema }
            };

            result = pickRelevantJsonSchemaDefinitions(jsonSchema, ['User']);
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value.definitions).toEqual({
                    User: userWithAnyOf,
                    PublicData: publicDataSchema,
                    PrivateData: privateDataSchema
                });
            }

            // Test allOf
            const basicInfoSchema: JSONSchema7 = { type: 'object', properties: { name: { type: 'string' } } };
            const contactInfoSchema: JSONSchema7 = { type: 'object', properties: { email: { type: 'string' } } };

            jsonSchema = {
                definitions: { User: userWithAllOf, BasicInfo: basicInfoSchema, ContactInfo: contactInfoSchema }
            };

            result = pickRelevantJsonSchemaDefinitions(jsonSchema, ['User']);
            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value.definitions).toEqual({
                    User: userWithAllOf,
                    BasicInfo: basicInfoSchema,
                    ContactInfo: contactInfoSchema
                });
            }
        });

        it('should handle nested definitions references', () => {
            const userWithNestedDefs: JSONSchema7 = {
                type: 'object',
                properties: { id: { type: 'string' } },
                definitions: {
                    NestedProfile: { $ref: '#/definitions/Profile' }
                }
            };

            const jsonSchema: JSONSchema7 = {
                definitions: {
                    User: userWithNestedDefs,
                    Profile: baseProfileSchema
                }
            };
            const models = ['User'];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({
                    definitions: {
                        User: userWithNestedDefs,
                        Profile: baseProfileSchema
                    }
                });
            }
        });
    });

    describe('complex scenarios', () => {
        it('should handle multiple models with overlapping references', () => {
            const userWithProfile: JSONSchema7 = {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    profile: { $ref: '#/definitions/Profile' }
                }
            };

            const postWithAuthor: JSONSchema7 = {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    author: { $ref: '#/definitions/Profile' }
                }
            };

            const jsonSchema: JSONSchema7 = {
                definitions: {
                    User: userWithProfile,
                    Post: postWithAuthor,
                    Profile: baseProfileSchema
                }
            };
            const models = ['User', 'Post'];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({
                    definitions: {
                        User: userWithProfile,
                        Post: postWithAuthor,
                        Profile: baseProfileSchema
                    }
                });
            }
        });

        it('should handle circular references gracefully', () => {
            const userWithFriends: JSONSchema7 = {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    friends: {
                        type: 'array',
                        items: { $ref: '#/definitions/User' }
                    }
                }
            };

            const jsonSchema: JSONSchema7 = {
                definitions: { User: userWithFriends }
            };
            const models = ['User'];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({
                    definitions: { User: userWithFriends }
                });
            }
        });

        it('should handle non-object schema definitions', () => {
            const userWithTags: JSONSchema7 = {
                type: 'object',
                properties: {
                    id: { type: 'string' },
                    tags: {
                        type: 'array',
                        items: { type: 'string' } // primitive type, not a reference
                    }
                }
            };

            const jsonSchema: JSONSchema7 = {
                definitions: { User: userWithTags }
            };
            const models = ['User'];

            const result = pickRelevantJsonSchemaDefinitions(jsonSchema, models);

            expect(result.isOk()).toBe(true);
            if (result.isOk()) {
                expect(result.value).toEqual({
                    definitions: { User: userWithTags }
                });
            }
        });
    });
});
