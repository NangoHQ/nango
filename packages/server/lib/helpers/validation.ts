import { URL } from 'url';

import * as z from 'zod';

import {
    connectionTagsKeySchema,
    connectionTagsSchema,
    getServerOutboundUrlPolicy,
    isOutboundUrlAllowed,
    TAG_MAX_COUNT,
    validateCaseInsensitiveTagKeys
} from '@nangohq/shared';

import { envs } from '../env.js';

export { TAG_MAX_COUNT, connectionTagsKeySchema, connectionTagsSchema };

/**
 * Validates a webhook URL: must be a valid URL (or empty), cannot point to Nango's own domain,
 * and cannot resolve to a blocked host (loopback, private, link-local, metadata, ...).
 */
export const webhookUrlSchema = z
    .union([z.url(), z.literal('')])
    .optional()
    .refine(
        (url) => {
            if (!url || url.trim() === '') return true;
            const hostname = new URL(url).hostname.replace(/\.+$/, '');
            return hostname !== 'nango.dev' && !hostname.endsWith('.nango.dev');
        },
        { message: `Webhook URLs cannot point to Nango's domain (nango.dev).` }
    )
    .refine(
        (url) => {
            if (!url || url.trim() === '') return true;
            return isOutboundUrlAllowed(url, getServerOutboundUrlPolicy());
        },
        { message: 'This webhook URL is not allowed.' }
    );

// Connection params come from untrusted clients. `webhook_url` is intentionally NOT accepted here: it is a
// privileged routing directive set only by trusted actors (connect session, public API, dashboard). Any
// client-supplied `webhook_url` is stripped in getConnectionConfig.
export const connectionConfigParamsSchema = z.looseObject({}).optional();

export const providerSchema = z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(255);
export const providerNameSchema = z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(255);
export const providerConfigKeySchema = z
    .string()
    .regex(/^[a-zA-Z0-9~:.@ _-]+$/) // For legacy reason (some people are using special characters)
    .max(255);
export const integrationDisplayNameSchema = z.string().min(1).max(255).optional();
export const integrationForwardWebhooksSchema = z.boolean().optional();
export const scriptNameSchema = z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(255);
export const functionTypeSchema = z.enum(['sync', 'action', 'on-event']);
// On-event functions can't be targeted by name alone yet, so deletion is limited to sync/action.
export const deletableFunctionTypeSchema = z.enum(['sync', 'action']);
// Shared querystring fields for the function-list endpoints. The private route adds `env`; the public route
// derives the environment from the secret key, so it spreads these as-is.
export const functionListQueryFields = {
    type: functionTypeSchema.optional(),
    search: z.string().trim().min(1).max(255).optional(),
    page: z.coerce.number().int().min(0).optional().default(0),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20)
};
export const connectionIdSchema = z
    .string()
    .regex(/^[a-zA-Z0-9,.;:=+~[\]|@${}"'\\/_ -]+$/) // For legacy reason (some people are stringifying json and passing email)
    .max(255);
export const envSchema = z
    .string()
    .regex(/^[a-z0-9_-]+$/)
    .max(255);
export const connectSessionTokenPrefix = 'nango_connect_session_';
export const connectSessionTokenSchema = z.string().regex(new RegExp(`^${connectSessionTokenPrefix}[a-f0-9]{64}$`));
export const modelSchema = z
    .string()
    .regex(/^[A-Z][a-zA-Z0-9_-]+$/)
    .max(255);
export const syncNameSchema = z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(255);
export const variantSchema = z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(255);

export const frequencySchema = z
    .string()
    .regex(
        /^(?<every>every )?((?<amount>[0-9]+)?\s?(?<unit>(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?))|(?<unit2>(month|week|half day|half hour|quarter hour)))$/
    );

export const connectionCredential = z.union([
    z.object({ public_key: z.string().uuid(), hmac: z.string().optional() }),
    z.object({ connect_session_token: connectSessionTokenSchema })
]);

export const privateKeySchema = z.string().startsWith('-----BEGIN RSA PRIVATE KEY----').endsWith('-----END RSA PRIVATE KEY-----');
export const publicKeySchema = z.string().startsWith('-----BEGIN PUBLIC KEY----').endsWith('-----END PUBLIC KEY-----');
export const integrationCredentialsSchema = z.discriminatedUnion(
    'type',
    [
        z
            .object({
                type: z.enum(['OAUTH1', 'OAUTH2', 'TBA']),
                client_id: z.string().min(1).max(255),
                client_secret: z.string().min(1),
                scopes: z.union([z.string().regex(/^[0-9a-zA-Z:/_.-]+(,[0-9a-zA-Z:/_.-]+)*$/), z.string().max(0)]).optional(),
                webhook_secret: z.string().min(0).max(255).optional()
            })
            .strict(),
        z
            .object({
                type: z.enum(['APP']),
                app_id: z.string().min(1).max(255),
                app_link: z.string().min(1),
                private_key: privateKeySchema
            })
            .strict(),
        z
            .object({
                type: z.enum(['CUSTOM']),
                client_id: z.string().min(1).max(255),
                client_secret: z.string().min(1),
                app_id: z.string().min(1).max(255),
                app_link: z.string().min(1),
                private_key: privateKeySchema
            })
            .strict()
    ],
    { error: () => ({ message: 'invalid credentials object' }) }
);

export const sharedCredentialsSchema = z
    .object({
        name: providerNameSchema,
        client_id: z.string().min(1).max(255),
        client_secret: z.string().min(1),
        scopes: z.union([z.string().regex(/^[0-9a-zA-Z:/_.-]+(,[0-9a-zA-Z:/_.-]+)*$/), z.string().max(0)]).optional()
    })
    .strict();

export const connectionCredentialsOauth2Schema = z.strictObject({
    access_token: z.string().min(1).max(envs.NANGO_SERVER_OAUTH2_TOKEN_MAX_LENGTH),
    refresh_token: z.string().min(1).max(envs.NANGO_SERVER_OAUTH2_TOKEN_MAX_LENGTH).optional(),
    expires_at: z.coerce.date().optional(),
    config_override: z
        .strictObject({
            client_id: z.string().min(1).max(255).optional(),
            client_secret: z.string().min(1).max(2048).optional()
        })
        .optional()
});

export const connectionCredentialsOauth2CCSchema = z.strictObject({
    token: z.string().min(1).max(4096),
    client_id: z.string().min(1).max(255),
    client_secret: z.string().min(1).max(2048),
    client_certificate: z.string().min(1).max(10000).optional(),
    client_private_key: z.string().min(1).max(10000).optional(),
    expires_at: z.coerce.date().optional()
});

export const connectionCredentialsOauth1Schema = z.strictObject({
    oauth_token: z.string().min(1).max(2048),
    oauth_token_secret: z.string().min(1).max(2048)
});

export const connectionCredentialsBasicSchema = z.strictObject({
    username: z.string().max(1024), // no .min() because some providers do not require password (ashby, bitdefender)
    password: z.string().max(1024) // no .min() because some providers do not require username (affinity)
});

export const connectionCredentialsApiKeySchema = z.strictObject({
    apiKey: z.string().min(1).max(1024)
});

export const connectionCredentialsTBASchema = z.strictObject({
    token_id: z.string().min(1),
    token_secret: z.string().min(1),
    config_override: z
        .strictObject({
            client_id: z.string().min(1).max(255).optional(),
            client_secret: z.string().min(1).max(2048).optional()
        })
        .optional()
});

export const connectionCredentialsGithubAppSchema = z.strictObject({
    app_id: z.string().min(1).max(255),
    installation_id: z.string().min(1).max(255)
});

export const connectionEndUserTagsSchema = z
    // Please be careful when changing this:
    // It's a labelling system, if we allow more than string people will store complex data (e.g: nested object) and ask for features around that
    // + It's an object not a an array of string because customers wants to store layers of origin (e.g: projectId, orgId, etc.)
    // But they complained a lot about concatenation of string, so an object solves that cleanly
    .record(connectionTagsKeySchema, z.string().max(255))
    .check((payload) => {
        for (const message of validateCaseInsensitiveTagKeys(payload.value)) {
            payload.issues.push({ code: 'custom', message, input: payload.value });
        }
    });

export const endUserSchema = z.strictObject({
    id: z.string().max(255).min(1),
    email: z.string().email().min(5).optional(),
    display_name: z.string().max(255).optional(),
    tags: connectionEndUserTagsSchema.optional()
});
