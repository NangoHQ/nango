import * as z from 'zod/v4';

import { functionTypeSchema, providerConfigKeySchema, syncNameSchema } from '../../../helpers/validation.js';
import { functionIntegrationIdSchema, runnableFunctionTypeSchema } from '../../functions/validation.js';

export const deployFunctionArgumentsSchema = z
    .object({
        integration_id: functionIntegrationIdSchema,
        function_name: syncNameSchema,
        function_type: runnableFunctionTypeSchema,
        code: z.string().min(1),
        version: z.string().optional(),
        allow_destructive: z.boolean().optional()
    })
    .strict();

export const deployTemplateArgumentsSchema = z
    .object({
        integration_id: functionIntegrationIdSchema,
        template: syncNameSchema,
        function_type: runnableFunctionTypeSchema.optional()
    })
    .strict();

export const getDeploymentStatusArgumentsSchema = z.object({ id: z.string().uuid() }).strict();

export const deploymentCreateOutputSchema = z
    .object({
        id: z.string().uuid(),
        status: z.enum(['waiting', 'running', 'success', 'failed']),
        created_at: z.iso.datetime()
    })
    .strict();

export const getDeploymentStatusOutputSchema = z
    .object({
        id: z.string().uuid(),
        status: z.enum(['waiting', 'running', 'success', 'failed']),
        integration_id: z.string(),
        function_name: z.string(),
        function_type: runnableFunctionTypeSchema,
        created_at: z.iso.datetime(),
        updated_at: z.iso.datetime(),
        started_at: z.iso.datetime().optional(),
        completed_at: z.iso.datetime().optional(),
        duration_ms: z.number().int().nonnegative().optional(),
        deployed: z.boolean().optional(),
        deployed_functions: z.array(z.object({ name: z.string(), version: z.string() }).strict()).optional(),
        output: z.string().optional(),
        error: z
            .object({
                code: z.string(),
                message: z.string().optional(),
                payload: z.unknown().optional()
            })
            .strict()
            .optional()
    })
    .strict();

export const listFunctionsArgumentsSchema = z
    .object({
        integration_id: providerConfigKeySchema.min(1),
        type: functionTypeSchema.optional(),
        search: z.string().trim().min(1).max(255).optional(),
        page: z.number().int().min(0).optional().default(0),
        limit: z.number().int().min(1).max(100).optional().default(20)
    })
    .strict();

const deployedFunctionBaseSchema = {
    id: z.number().int(),
    name: z.string(),
    description: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    enabled: z.boolean(),
    last_deployed: z.iso.datetime(),
    source: z.enum(['catalog', 'standalone', 'repo'])
};

const jsonSchemaSchema: z.ZodType<object> = z.looseObject({});

const deployedSyncFunctionSchema = z
    .object({
        ...deployedFunctionBaseSchema,
        type: z.literal('sync'),
        input: z.string().optional(),
        returns: z.array(z.string()),
        json_schema: jsonSchemaSchema.nullable(),
        runs: z.string().nullable(),
        auto_start: z.boolean(),
        track_deletes: z.boolean()
    })
    .strict();

const deployedActionFunctionSchema = z
    .object({
        ...deployedFunctionBaseSchema,
        type: z.literal('action'),
        input: z.string().optional(),
        returns: z.array(z.string()),
        json_schema: jsonSchemaSchema.nullable()
    })
    .strict();

const deployedOnEventFunctionSchema = z
    .object({
        ...deployedFunctionBaseSchema,
        type: z.literal('on-event'),
        event: z.enum(['post-connection-creation', 'pre-connection-deletion', 'validate-connection'])
    })
    .strict();

export const deployedFunctionSchema = z.discriminatedUnion('type', [deployedSyncFunctionSchema, deployedActionFunctionSchema, deployedOnEventFunctionSchema]);

export const listFunctionsOutputSchema = z
    .object({
        data: z.array(deployedFunctionSchema),
        pagination: z
            .object({
                total: z.number().int().min(0),
                page: z.number().int().min(0),
                limit: z.number().int().min(1).max(100)
            })
            .strict()
    })
    .strict();

export type ListFunctionsOutput = z.infer<typeof listFunctionsOutputSchema>;
export type DeploymentCreateOutput = z.infer<typeof deploymentCreateOutputSchema>;
export type GetDeploymentStatusOutput = z.infer<typeof getDeploymentStatusOutputSchema>;
