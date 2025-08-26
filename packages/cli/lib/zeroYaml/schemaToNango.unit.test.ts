import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { schemaToNangoModelField } from './schemaToNango.js';

import type { StandardSchemaV1 } from '@nangohq/runner-sdk/lib/types.js';

// Mock Standard Schema implementation for testing
function createMockStandardSchema(optional = false): StandardSchemaV1<any> {
    return {
        '~standard': {
            version: 1,
            vendor: 'test',
            validate: (value: unknown) => {
                if (value === undefined && optional) {
                    return { value: undefined };
                }
                if (value === undefined && !optional) {
                    return { issues: [{ message: 'Required' }] };
                }
                return { value };
            }
        }
    };
}

describe('schemaToNango', () => {
    describe('Zod schemas with introspection', () => {
        it('should handle Zod string schema with full introspection', () => {
            const result = schemaToNangoModelField('test', z.string());
            expect(result).toEqual({
                name: 'test',
                value: 'string',
                tsType: true,
                optional: false
            });
        });

        it('should handle Zod object schema with full field extraction', () => {
            const result = schemaToNangoModelField(
                'GithubIssue',
                z.object({
                    id: z.string(),
                    title: z.string(),
                    state: z.string()
                })
            );

            // Zod schemas get rich introspection for better documentation
            expect(result).toEqual({
                name: 'GithubIssue',
                value: [
                    { name: 'id', value: 'string', tsType: true, optional: false },
                    { name: 'title', value: 'string', tsType: true, optional: false },
                    { name: 'state', value: 'string', tsType: true, optional: false }
                ],
                optional: false
            });
        });

        it('should handle optional Zod schema', () => {
            const result = schemaToNangoModelField('test', z.string().optional());
            expect(result).toEqual({
                name: 'test',
                value: 'string',
                tsType: true,
                optional: true
            });
        });

        it('should handle complex nested Zod schema', () => {
            const schema = z.object({
                id: z.string(),
                user: z.object({
                    name: z.string(),
                    email: z.string().optional()
                }),
                tags: z.array(z.string())
            });

            const result = schemaToNangoModelField('ComplexModel', schema);

            expect(result.name).toBe('ComplexModel');
            expect(result.optional).toBe(false);
            expect(Array.isArray(result.value)).toBe(true);

            if (Array.isArray(result.value)) {
                expect(result.value).toHaveLength(3);

                // Check id field
                expect(result.value[0]).toEqual({
                    name: 'id',
                    value: 'string',
                    tsType: true,
                    optional: false
                });

                // Check user field (nested object)
                expect(result.value[1].name).toBe('user');
                expect(Array.isArray(result.value[1].value)).toBe(true);

                // Check tags field (array)
                expect(result.value[2]).toEqual({
                    name: 'tags',
                    value: 'string',
                    tsType: true,
                    array: true,
                    optional: false
                });
            }
        });
    });

    describe('Standard Schema without introspection', () => {
        it('should handle non-Zod Standard Schema with generic approach', () => {
            const schema = createMockStandardSchema();
            const result = schemaToNangoModelField('TestModel', schema);

            // Non-Zod schemas get 'any' type
            // This is fine because runtime validation uses the Standard Schema interface
            expect(result).toEqual({
                name: 'TestModel',
                value: 'any',
                tsType: true,
                optional: false
            });
        });

        it('should detect optional Standard Schema', () => {
            const schema = createMockStandardSchema(true);
            const result = schemaToNangoModelField('OptionalModel', schema);

            expect(result).toEqual({
                name: 'OptionalModel',
                value: 'any',
                tsType: true,
                optional: true
            });
        });

        it('should handle async validation schemas gracefully', () => {
            const asyncSchema: StandardSchemaV1<any> = {
                '~standard': {
                    version: 1,
                    vendor: 'async-test',
                    validate: (value: unknown) => {
                        // Return a promise to simulate async validation
                        return Promise.resolve({ value });
                    }
                }
            };

            const result = schemaToNangoModelField('AsyncModel', asyncSchema);

            // Async schemas default to required since we can't check synchronously
            expect(result).toEqual({
                name: 'AsyncModel',
                value: 'any',
                tsType: true,
                optional: false
            });
        });
    });

    describe('Real-world usage patterns', () => {
        it('should work with Valibot-like Standard Schema', () => {
            // Simulating a Valibot schema that implements Standard Schema
            const valibotLikeSchema: StandardSchemaV1<{ id: string; title: string }> = {
                '~standard': {
                    version: 1,
                    vendor: 'valibot',
                    validate: (value: unknown) => {
                        if (typeof value === 'object' && value !== null && 'id' in value && 'title' in value) {
                            return { value: value as { id: string; title: string } };
                        }
                        return { issues: [{ message: 'Invalid object' }] };
                    }
                }
            };

            const result = schemaToNangoModelField('ValibotModel', valibotLikeSchema);

            // Valibot gets 'any' type (no introspection available)
            // Users still get full type safety from Valibot's own type inference
            expect(result).toEqual({
                name: 'ValibotModel',
                value: 'any',
                tsType: true,
                optional: false
            });
        });

        it('should work with Yup-like Standard Schema', () => {
            // Simulating a Yup schema that implements Standard Schema
            const yupLikeSchema: StandardSchemaV1<string> = {
                '~standard': {
                    version: 1,
                    vendor: 'yup',
                    validate: (value: unknown) => {
                        if (typeof value === 'string') {
                            return { value };
                        }
                        return { issues: [{ message: 'Must be a string' }] };
                    }
                }
            };

            const result = schemaToNangoModelField('YupModel', yupLikeSchema);

            expect(result).toEqual({
                name: 'YupModel',
                value: 'any',
                tsType: true,
                optional: false
            });
        });
    });

    describe('Backward compatibility', () => {
        it('should maintain compatibility with existing Zod workflows', () => {
            const zodSchema = z.object({
                id: z.string(),
                count: z.number(),
                active: z.boolean().optional()
            });

            const result = schemaToNangoModelField('TestModel', zodSchema);

            // Zod schemas maintain rich introspection
            expect(result).toEqual({
                name: 'TestModel',
                value: [
                    { name: 'id', value: 'string', tsType: true, optional: false },
                    { name: 'count', value: 'number', tsType: true, optional: false },
                    { name: 'active', value: 'boolean', tsType: true, optional: true }
                ],
                optional: false
            });
        });
    });

    describe('Edge cases', () => {
        it('should handle schemas that throw during validation', () => {
            const throwingSchema: StandardSchemaV1<any> = {
                '~standard': {
                    version: 1,
                    vendor: 'throwing',
                    validate: () => {
                        throw new Error('Validation error');
                    }
                }
            };

            const result = schemaToNangoModelField('ThrowingModel', throwingSchema);

            // Defaults to required when validation throws
            expect(result).toEqual({
                name: 'ThrowingModel',
                value: 'any',
                tsType: true,
                optional: false
            });
        });

        it('should handle Zod schemas where introspection fails', () => {
            // Create a mock Zod-like schema with broken introspection
            const brokenZodSchema = {
                _def: {}, // Has _def but introspection will fail
                '~standard': {
                    version: 1,
                    vendor: 'zod',
                    validate: (value: unknown) => {
                        if (value === undefined) {
                            return { issues: [{ message: 'Required' }] };
                        }
                        return { value };
                    }
                }
            };

            const result = schemaToNangoModelField('BrokenZod', brokenZodSchema as any);

            // Falls back to generic approach when introspection fails
            expect(result).toEqual({
                name: 'BrokenZod',
                value: 'any',
                tsType: true,
                optional: false
            });
        });
    });
});
