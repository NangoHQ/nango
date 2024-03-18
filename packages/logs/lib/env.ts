import { z } from 'zod';

const schema = z.object({
    NANGO_LOGS_DB_URL: z.string().url().optional(),
    NANGO_DATABASE_URL: z.string().url().optional(),
    SERVER_RUN_MODE: z.enum(['DOCKERIZED', '']).optional(),
    NANGO_DB_HOST: z.string().optional().default('localhost'),
    NANGO_DB_PORT: z.number().optional().default(5432),
    NANGO_DB_USER: z.string().optional().default('nango'),
    NANGO_DB_NAME: z.string().optional().default('nango'),
    NANGO_DB_PASSWORD: z.string().optional().default('nango'),
    NANGO_DB_SSL: z.enum(['true', 'false']).optional().default('false'),
    NODE_ENV: z.enum(['production', 'development', 'test']).default('development')
});

export const envs = schema.parse(process.env);

export const isProd = envs.NODE_ENV === 'production';
