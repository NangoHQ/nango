import { z } from 'zod';

export function envErrorToString(issues: z.ZodIssue[]) {
    return issues
        .map((issue) => {
            return `${issue.path.join('')} (${issue.code} ${issue.message})`;
        })
        .join(', ');
}

export function initGlobalEnv() {
    const schema = z.object({
        // Database
        NANGO_DATABASE_URL: z.string().url().optional(),
        NANGO_DB_HOST: z.string().optional().default('localhost'),
        NANGO_DB_PORT: z.coerce.number().optional().default(5432),
        NANGO_DB_USER: z.string().optional().default('nango'),
        NANGO_DB_NAME: z.string().optional().default('nango'),
        NANGO_DB_PASSWORD: z.string().optional().default('nango'),
        NANGO_DB_SSL: z.enum(['true', 'false']).optional().default('false'),

        // env
        NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
        CI: z.enum(['true', 'false']).default('false'),
        VITEST: z.enum(['true', 'false']).default('false'),

        // others
        SERVER_RUN_MODE: z.enum(['DOCKERIZED', '']).optional()
    });

    const res = schema.safeParse(process.env);
    if (!res.success) {
        throw new Error(`Missing or invalid env vars: ${envErrorToString(res.error.issues)}`);
    }

    return res.data;
}
