import { z } from 'zod';

import { connectionIdSchema, providerConfigKeySchema, syncNameSchema } from '../../helpers/validation.js';

const integrationIdSchema = providerConfigKeySchema.refine((value) => value !== '.' && value !== '..', {
    message: 'Integration id cannot be "." or ".."'
});

const remoteFunctionBaseBodySchema = z
    .object({
        integration_id: integrationIdSchema,
        function_name: syncNameSchema,
        function_type: z.enum(['action', 'sync']),
        code: z.string().min(1)
    })
    .strict();

export const remoteFunctionCompileBodySchema = remoteFunctionBaseBodySchema;

export const remoteFunctionDeployBodySchema = remoteFunctionBaseBodySchema;

export const remoteFunctionDryrunBodySchema = remoteFunctionBaseBodySchema
    .extend({
        connection_id: connectionIdSchema,
        input: z.unknown().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        checkpoint: z.record(z.string(), z.unknown()).optional(),
        last_sync_date: z.string().datetime().optional()
    })
    .strict();

export const functionCompileBodySchema = z
    .object({
        code: z.string().min(1)
    })
    .strict();

export const functionDryrunBodySchema = z
    .object({
        integration_id: integrationIdSchema,
        function_type: z.enum(['action', 'sync']),
        code: z.string().min(1),
        connection_id: connectionIdSchema,
        input: z.unknown().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        checkpoint: z.record(z.string(), z.unknown()).optional(),
        last_sync_date: z.string().datetime().optional()
    })
    .strict();

export const functionDeploymentBodySchema = z
    .object({
        type: z.literal('single'),
        integration_id: integrationIdSchema,
        function_name: syncNameSchema,
        function_type: z.enum(['action', 'sync']),
        code: z.string().min(1),
        version: z.string().optional(),
        allow_destructive: z.boolean().optional()
    })
    .strict();
