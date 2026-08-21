import * as z from 'zod/v4';

import { functionTypeSchema, providerConfigKeySchema } from '../../../helpers/validation.js';

import type { FunctionListSuccess } from '@nangohq/types';

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

const deployedSyncFunctionSchema = z
    .object({
        ...deployedFunctionBaseSchema,
        type: z.literal('sync'),
        input: z.string().optional(),
        returns: z.array(z.string()),
        json_schema: z.looseObject({}).nullable(),
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
        json_schema: z.looseObject({}).nullable()
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

export type ListFunctionsOutput = FunctionListSuccess;
