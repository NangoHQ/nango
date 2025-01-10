import { z } from 'zod';

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

export const connectionCredential = z.union([
    z.object({ public_key: z.string().uuid(), hmac: z.string().optional() }),
    z.object({ connect_session_token: connectSessionTokenSchema })
]);

export const stringBool = z
    .enum(['true', 'false', ''])
    .optional()
    .default('false')
    .transform((value) => value === 'true');
