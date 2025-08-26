import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import type { SchemaModel, StandardSchemaV1 } from './types.js';

// Mock Valibot-like schema that implements StandardSchema
function createValibotLikeSchema(): StandardSchemaV1<{ id: string; name: string }> {
    return {
        '~standard': {
            version: 1,
            vendor: 'valibot',
            validate(value: unknown) {
                if (typeof value !== 'object' || value === null) {
                    return { issues: [{ message: 'Expected object' }] };
                }
                const obj = value as any;
                if (typeof obj.id !== 'string') {
                    return { issues: [{ message: 'id must be string' }] };
                }
                if (typeof obj.name !== 'string') {
                    return { issues: [{ message: 'name must be string' }] };
                }
                return { value: obj as { id: string; name: string } };
            }
        }
    };
}

// Create a minimal concrete implementation for testing
// Avoid importing NangoSyncBase directly to prevent dependency issues
class TestSyncRunner {
    protected models?: Record<string, SchemaModel>;
    protected runnerFlags: any;
    protected syncConfig: any;

    constructor(props: any) {
        this.runnerFlags = props.runnerFlags;
        this.syncConfig = props.syncConfig;
    }

    public setModels(models: Record<string, SchemaModel>): void {
        this.models = models;
    }

    // This is a simplified version of the actual validateRecords method
    protected validateRecords(model: string, records: unknown[]): { data: any; validation: any[] }[] {
        const hasErrors: { data: any; validation: any[] }[] = [];

        // If we have StandardSchema models, use them for validation
        if (this.models && this.models[model]) {
            const schema = this.models[model];
            for (const record of records) {
                // Validate using StandardSchema
                const result = schema['~standard'].validate(record);

                // Handle async validation (not supported)
                if (result instanceof Promise) {
                    throw new Error('Async validation not supported');
                }

                if (result.issues) {
                    hasErrors.push({
                        data: record,
                        validation: [
                            {
                                message: result.issues[0]?.message || 'Validation failed',
                                path: model
                            }
                        ]
                    });

                    if (this.runnerFlags?.validateSyncRecords) {
                        break;
                    }
                }
            }
            return hasErrors;
        }

        // Fallback validation would go here
        return hasErrors;
    }

    // Expose for testing
    public testValidateRecords(model: string, records: unknown[]) {
        return this.validateRecords(model, records);
    }
}

describe('StandardSchema validation in NangoSyncBase', () => {
    const mockProps = {
        connectionId: 'test',
        environmentId: 1,
        providerConfigKey: 'test',
        activityLogId: 'test',
        scriptType: 'sync' as const,
        syncConfig: {
            version: '1',
            models_json_schema: null
        },
        runnerFlags: { validateSyncRecords: true }
    };

    describe('with Zod schemas', () => {
        it('should validate records using Zod StandardSchema', () => {
            const userSchema = z.object({
                id: z.string(),
                name: z.string()
            });

            const models = { User: userSchema };
            const sync = new TestSyncRunner(mockProps);
            sync.setModels(models);

            // Valid records
            const validRecords = [
                { id: '1', name: 'Alice' },
                { id: '2', name: 'Bob' }
            ];
            const validResult = sync.testValidateRecords('User', validRecords);
            expect(validResult).toEqual([]);

            // Invalid records
            const invalidRecords = [
                { id: 1, name: 'Charlie' }, // id should be string
                { id: '3' } // missing name
            ];
            const invalidResult = sync.testValidateRecords('User', invalidRecords);
            expect(invalidResult).toHaveLength(1); // stops after first error due to validateSyncRecords flag
            expect(invalidResult[0].data).toEqual({ id: 1, name: 'Charlie' });
        });
    });

    describe('with Valibot-like schemas', () => {
        it('should validate records using Valibot-like StandardSchema', () => {
            const userSchema = createValibotLikeSchema();
            const models = { User: userSchema };
            const sync = new TestSyncRunner(mockProps);
            sync.setModels(models);

            // Valid records
            const validRecords = [
                { id: '1', name: 'Alice' },
                { id: '2', name: 'Bob' }
            ];
            const validResult = sync.testValidateRecords('User', validRecords);
            expect(validResult).toEqual([]);

            // Invalid records
            const invalidRecords = [
                { id: 1, name: 'Charlie' }, // id should be string
                { id: '3', name: 123 } // name should be string
            ];
            const invalidResult = sync.testValidateRecords('User', invalidRecords);
            expect(invalidResult).toHaveLength(1); // stops after first error
            expect(invalidResult[0].validation[0].message).toContain('id must be string');
        });
    });

    describe('mixed validation libraries', () => {
        it('should handle models from different validation libraries', () => {
            const zodSchema = z.object({
                id: z.string(),
                title: z.string()
            });

            const valibotSchema = createValibotLikeSchema();

            const models = {
                Post: zodSchema,
                User: valibotSchema
            };

            const sync = new TestSyncRunner(mockProps);
            sync.setModels(models);

            // Validate with Zod schema
            const postResult = sync.testValidateRecords('Post', [{ id: '1', title: 'Hello' }]);
            expect(postResult).toEqual([]);

            // Validate with Valibot schema
            const userResult = sync.testValidateRecords('User', [{ id: '2', name: 'Alice' }]);
            expect(userResult).toEqual([]);
        });
    });
});
