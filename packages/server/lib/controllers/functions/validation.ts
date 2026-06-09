import { z } from 'zod';

import { connectionIdSchema, providerConfigKeySchema, syncNameSchema } from '../../helpers/validation.js';

const integrationIdSchema = providerConfigKeySchema.refine((value) => value !== '.' && value !== '..', {
    message: 'Integration id cannot be "." or ".."'
});

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

const functionAsyncJobParamsSchema = z
    .object({
        id: z.string().uuid()
    })
    .strict();

const functionAsyncJobResultBodySchema = z.discriminatedUnion('status', [
    z
        .object({
            status: z.literal('success'),
            output: z.string(),
            duration_ms: z.number().int().nonnegative().optional()
        })
        .strict(),
    z
        .object({
            status: z.literal('failed'),
            output: z.string().optional(),
            duration_ms: z.number().int().nonnegative().optional(),
            error: z
                .object({
                    code: z.string().optional(),
                    message: z.string(),
                    payload: z.unknown().optional()
                })
                .strict()
        })
        .strict()
]);

export const functionDryrunParamsSchema = functionAsyncJobParamsSchema;
export const functionDryrunResultBodySchema = functionAsyncJobResultBodySchema;

export const functionDeploymentBodySchema = z
    .object({
        type: z.literal('function'),
        integration_id: integrationIdSchema,
        function_name: syncNameSchema,
        function_type: z.enum(['action', 'sync']),
        code: z.string().min(1),
        version: z.string().optional(),
        allow_destructive: z.boolean().default(false)
    })
    .strict();

export const functionDeploymentParamsSchema = functionAsyncJobParamsSchema;
export const functionDeploymentResultBodySchema = functionAsyncJobResultBodySchema;
