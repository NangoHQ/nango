import * as z from 'zod/v4';

import { functionTypeSchema, providerConfigKeySchema, syncNameSchema } from '../../../helpers/validation.js';
import { functionIntegrationIdSchema, runnableFunctionTypeSchema } from '../../functions/validation.js';

import type { FunctionDeploymentBody } from '@nangohq/types';

// The MCP SDK only advertises top-level Zod object schemas. Model the public deployment union as a strict
// object, publish its conditional shape through JSON Schema metadata, and enforce the same conditions at runtime.
export const deployFunctionsArgumentsSchema = z
    .object({
        type: z.enum(['function', 'template']),
        integration_id: functionIntegrationIdSchema,
        function_name: syncNameSchema.optional(),
        function_type: runnableFunctionTypeSchema.optional(),
        code: z.string().min(1).optional(),
        version: z.string().optional(),
        allow_destructive: z.boolean().optional(),
        template: syncNameSchema.optional()
    })
    .strict()
    .superRefine((args, ctx) => {
        if (args.type === 'function') {
            requireArgument(args.function_name, 'function_name', 'function', ctx);
            requireArgument(args.function_type, 'function_type', 'function', ctx);
            requireArgument(args.code, 'code', 'function', ctx);
            rejectArgument(args.template, 'template', 'function', ctx);
            return;
        }

        requireArgument(args.template, 'template', 'template', ctx);
        rejectArgument(args.function_name, 'function_name', 'template', ctx);
        rejectArgument(args.code, 'code', 'template', ctx);
        rejectArgument(args.version, 'version', 'template', ctx);
        rejectArgument(args.allow_destructive, 'allow_destructive', 'template', ctx);
    })
    .meta({
        oneOf: [
            {
                properties: { type: { const: 'function' } },
                required: ['function_name', 'function_type', 'code'],
                not: { required: ['template'] }
            },
            {
                properties: { type: { const: 'template' } },
                required: ['template'],
                not: {
                    anyOf: [{ required: ['function_name'] }, { required: ['code'] }, { required: ['version'] }, { required: ['allow_destructive'] }]
                }
            }
        ]
    });

export const deployFunctionsOutputSchema = z
    .object({
        id: z.string().uuid(),
        status: z.enum(['waiting', 'running', 'success', 'failed']),
        created_at: z.iso.datetime()
    })
    .strict();

export function toFunctionDeploymentBody(args: z.output<typeof deployFunctionsArgumentsSchema>): FunctionDeploymentBody {
    if (args.type === 'function') {
        return {
            type: 'function',
            integration_id: args.integration_id,
            function_name: getRequiredDeploymentArgument(args.function_name, 'function_name'),
            function_type: getRequiredDeploymentArgument(args.function_type, 'function_type'),
            code: getRequiredDeploymentArgument(args.code, 'code'),
            ...(args.version !== undefined ? { version: args.version } : {}),
            ...(args.allow_destructive !== undefined ? { allow_destructive: args.allow_destructive } : {})
        };
    }

    return {
        type: 'template',
        integration_id: args.integration_id,
        template: getRequiredDeploymentArgument(args.template, 'template'),
        ...(args.function_type !== undefined ? { function_type: args.function_type } : {})
    };
}

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
export type DeployFunctionsOutput = z.infer<typeof deployFunctionsOutputSchema>;

function getRequiredDeploymentArgument<T>(value: T | undefined, field: string): T {
    if (value === undefined) {
        throw new Error(`Validated functions_deploy arguments are missing '${field}'`);
    }
    return value;
}

function requireArgument(value: unknown, field: string, type: 'function' | 'template', ctx: z.RefinementCtx): void {
    if (value !== undefined) {
        return;
    }
    ctx.addIssue({ code: 'custom', path: [field], message: `${field} is required when type is ${type}` });
}

function rejectArgument(value: unknown, field: string, type: 'function' | 'template', ctx: z.RefinementCtx): void {
    if (value === undefined) {
        return;
    }
    ctx.addIssue({ code: 'custom', path: [field], message: `${field} is not allowed when type is ${type}` });
}
