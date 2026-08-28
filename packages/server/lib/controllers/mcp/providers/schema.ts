import * as z from 'zod/v4';

import { providerNameSchema } from '../../../helpers/validation.js';

import type { AuthModeType } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

export const getProviderArgumentsSchema = z
    .object({
        provider: providerNameSchema,
        include_templates: z.boolean().optional().default(false)
    })
    .strict();

const authModeSchema = z.enum([
    'OAUTH1',
    'OAUTH2',
    'OAUTH2_CC',
    'BASIC',
    'API_KEY',
    'CUSTOM',
    'APP',
    'NONE',
    'TBA',
    'JWT',
    'BILL',
    'TWO_STEP',
    'SIGNATURE',
    'MCP_OAUTH2',
    'MCP_OAUTH2_GENERIC',
    'INSTALL_PLUGIN',
    'AWS_SIGV4'
] satisfies AuthModeType[]);

const jsonSchemaSchema = z.looseObject({}) as z.ZodType<JSONSchema7>;

const providerTemplateBaseSchema = {
    name: z.string(),
    description: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    input: z.string().optional(),
    returns: z.array(z.string()),
    json_schema: jsonSchemaSchema.nullable()
};

const providerSyncTemplateSchema = z
    .object({
        ...providerTemplateBaseSchema,
        type: z.literal('sync'),
        runs: z.string().nullable(),
        auto_start: z.boolean(),
        track_deletes: z.boolean()
    })
    .strict();

const providerActionTemplateSchema = z
    .object({
        ...providerTemplateBaseSchema,
        type: z.literal('action')
    })
    .strict();

export const providerTemplateSchema = z.discriminatedUnion('type', [providerSyncTemplateSchema, providerActionTemplateSchema]);

// We're using looseObject here because providers can have additional fields that vary by auth mode.
export const getProviderOutputSchema = z.looseObject({
    name: z.string(),
    display_name: z.string(),
    auth_mode: authModeSchema,
    docs: z.string(),
    logo_url: z.string(),
    templates: z.array(providerTemplateSchema).optional()
});

export type GetProviderOutput = z.infer<typeof getProviderOutputSchema>;
