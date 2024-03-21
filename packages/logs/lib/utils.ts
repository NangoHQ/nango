import { customAlphabet } from 'nanoid';
import { z } from 'zod';

export function initGlobalEnv() {
    const schema = z.object({
        NANGO_DATABASE_URL: z.string().url().optional(),
        SERVER_RUN_MODE: z.enum(['DOCKERIZED', '']).optional(),
        NANGO_DB_HOST: z.string().optional().default('localhost'),
        NANGO_DB_PORT: z.coerce.number().optional().default(5432),
        NANGO_DB_USER: z.string().optional().default('nango'),
        NANGO_DB_NAME: z.string().optional().default('nango'),
        NANGO_DB_PASSWORD: z.string().optional().default('nango'),
        NANGO_DB_SSL: z.enum(['true', 'false']).optional().default('false'),
        NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
        CI: z.enum(['true', 'false']).default('false'),
        VITEST: z.enum(['true', 'false']).default('false')
    });

    return schema.parse(process.env);
}

export function initLogsEnv() {
    const schema = z.object({
        NANGO_LOGS_ES_URL: z.string().url(),
        NANGO_LOGS_ES_USER: z.string(),
        NANGO_LOGS_ES_PWD: z.string()
    });

    return schema.parse(process.env);
}

export const alphabet = '346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtwxyz';
export const minSize = 8;
export const maxSize = 20;
export const nanoid = customAlphabet(alphabet, maxSize);
