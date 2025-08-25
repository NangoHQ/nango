import * as z from 'zod';

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
    access_token: z.string().min(1).max(2048),
    refresh_token: z.string().min(1).max(2048).optional(),
    expires_at: z.iso.datetime().optional(),
    config_override: z
        .strictObject({
            client_id: z.string().min(1).max(255).optional(),
            client_secret: z.string().min(1).max(2048).optional()
        })
        .optional()
});

export const connectionCredentialsOauth2CCSchema = z.strictObject({
    token: z.string().min(1).max(2048),
    client_id: z.string().min(1).max(255),
    client_secret: z.string().min(1).max(2048),
    client_certificate: z.string().min(1).max(10000).optional(),
    client_private_key: z.string().min(1).max(10000).optional(),
    expires_at: z.iso.datetime().optional()
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
    api_key: z.string().min(1).max(255)
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
