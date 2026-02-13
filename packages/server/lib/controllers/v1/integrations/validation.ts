import * as z from 'zod';

import {
    integrationDisplayNameSchema,
    integrationForwardWebhooksSchema,
    privateKeySchema,
    providerConfigKeySchema,
    providerSchema,
    publicKeySchema
} from '../../../helpers/validation.js';

// Common scope validation regex
const scopesSchema = z.union([z.string().regex(/^[0-9a-zA-Z:/_. -]+(,[0-9a-zA-Z:/_. -]+)*$/), z.string().max(0)]).optional();

// Auth type schemas for discriminated union
export const integrationAuthTypeOAuthSchema = z
    .object({
        authType: z.enum(['OAUTH1', 'OAUTH2', 'TBA']),
        clientId: z.string().min(1).max(255).optional(),
        clientSecret: z.string().min(1).optional(),
        scopes: scopesSchema
    })
    .strict();

export const integrationAuthTypeAppSchema = z
    .object({
        authType: z.enum(['APP']),
        appId: z.string().min(1).max(255).optional(),
        appLink: z.url().min(1).optional(),
        privateKey: privateKeySchema.optional()
    })
    .strict();

export const integrationAuthTypeCustomSchema = z
    .object({
        authType: z.enum(['CUSTOM']),
        clientId: z.string().min(1).max(255).optional(),
        clientSecret: z.string().min(1).optional(),
        appId: z.string().min(1).max(255).optional(),
        appLink: z.url().min(1).optional(),
        privateKey: privateKeySchema.optional()
    })
    .strict();

export const integrationAuthTypeMcpOAuth2Schema = z
    .object({
        authType: z.enum(['MCP_OAUTH2']),
        scopes: scopesSchema
    })
    .strict();

export const integrationAuthTypeMcpOAuth2GenericSchema = z
    .object({
        authType: z.enum(['MCP_OAUTH2_GENERIC']),
        clientName: z.string().min(1).max(255).optional(),
        clientUri: z.string().max(255).optional(),
        clientLogoUri: z.url().max(255).optional()
    })
    .strict();

export const integrationAuthTypeInstallPluginSchema = z
    .object({
        authType: z.enum(['INSTALL_PLUGIN']),
        appLink: z.url().max(255).optional(),
        username: z.string().min(1).max(255).optional(),
        password: z.string().min(1).max(255).optional()
    })
    .strict();

// Discriminated union for all auth types
export const integrationAuthTypeSchema = z.discriminatedUnion(
    'authType',
    [
        integrationAuthTypeOAuthSchema,
        integrationAuthTypeAppSchema,
        integrationAuthTypeCustomSchema,
        integrationAuthTypeMcpOAuth2Schema,
        integrationAuthTypeMcpOAuth2GenericSchema,
        integrationAuthTypeInstallPluginSchema
    ],
    { error: () => ({ message: 'invalid credentials object' }) }
);

// Base schema for integration body fields (without authType)
export const integrationBaseBodySchema = z
    .object({
        integrationId: providerConfigKeySchema.optional(),
        webhookSecret: z.union([z.string().min(0).max(255), publicKeySchema]).optional(),
        displayName: integrationDisplayNameSchema.optional(),
        forward_webhooks: integrationForwardWebhooksSchema
    })
    .strict();

// Schema for custom fields (e.g. aws_sigv4_config)
export const integrationCustomBodySchema = z.object({ custom: z.record(z.string(), z.union([z.string(), z.null()])) }).strict();

// Schema for PATCH integration body
export const patchIntegrationBodySchema = integrationBaseBodySchema.or(integrationCustomBodySchema).or(integrationAuthTypeSchema);

// Schema for POST integration body (extends base with provider and useSharedCredentials)
export const postIntegrationBodySchema = integrationBaseBodySchema.extend({
    provider: providerSchema,
    useSharedCredentials: z.boolean(),
    auth: integrationAuthTypeSchema.optional()
});
