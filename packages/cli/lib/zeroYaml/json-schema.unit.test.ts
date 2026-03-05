import { describe, expect, it } from 'vitest';
import * as z from 'zod';

import { buildJsonSchemaDefinitionsFromZodModels } from './json-schema.js';

describe('buildJsonSchemaDefinitionsFromZodModels', () => {
    it('should match snapshot', () => {
        const models = {
            Primitives: z.object({
                name: z.string().describe('The full name of the user'),
                age: z.number().describe('Age in years'),
                active: z.boolean()
            }),
            WithDate: z.object({
                createdAt: z.date().describe('ISO 8601 creation timestamp'),
                updatedAt: z.date().optional()
            }),
            WithArray: z.object({
                tags: z.array(z.string()),
                scores: z.array(z.number())
            }),
            Nested: z.object({
                user: z.object({
                    id: z.string(),
                    address: z.object({
                        city: z.string(),
                        zip: z.string().optional()
                    })
                }),
                items: z.array(
                    z.object({
                        id: z.number(),
                        label: z.string()
                    })
                )
            }),
            WithEnum: z.object({
                status: z.enum(['active', 'inactive', 'pending']).describe('Current lifecycle status'),
                role: z.union([z.literal('admin'), z.literal('user')])
            }),
            WithNullable: z.object({
                deletedAt: z.date().nullable(),
                note: z.string().nullable().optional()
            }),
            LooseObject: z.looseObject({
                id: z.string()
            }),
            WithCatchall: z
                .object({
                    id: z.string()
                })
                .catchall(z.number()),
            AsRecord: z.record(z.string(), z.boolean()),
            Voided: z.void()
        };

        const result = buildJsonSchemaDefinitionsFromZodModels(models);
        expect(result).toMatchSnapshot();
    });
});
