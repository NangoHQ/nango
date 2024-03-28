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
        NANGO_DB_SSL: z.coerce.boolean().default(false),
        NANGO_ENCRYPTION_KEY: z.string().optional(),

        // env
        NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
        CI: z.coerce.boolean().default(false),
        VITEST: z.coerce.boolean().default(false),

        // demo
        DEFAULT_GITHUB_CLIENT_ID: z.string().optional(),
        DEFAULT_GITHUB_CLIENT_SECRET: z.string().optional(),

        // auth
        WORKOS_API_KEY: z.string().optional(),
        WORKOS_CLIENT_ID: z.string().optional(),
        NANGO_DASHBOARD_USERNAME: z.string().optional(),
        NANGO_DASHBOARD_PASSWORD: z.string().optional(),

        // aws
        AWS_REGION: z.string().optional(),
        AWS_BUCKET_NAME: z.string().optional(),

        // others
        SERVER_RUN_MODE: z.enum(['DOCKERIZED', '']).optional(),
        NANGO_CLOUD: z.coerce.boolean().optional().default(false),
        NANGO_ENTERPRISE: z.coerce.boolean().optional().default(false),
        NANGO_SERVER_URL: z.string().url().optional(),
        NANGO_TELEMETRY_SDK: z.coerce.boolean().default(false).optional(),
        LOG_LEVEL: z.enum(['info', 'debug', 'warn', 'error']).optional().default('info')
    });

    const res = schema.safeParse(process.env);
    if (!res.success) {
        throw new Error(`Missing or invalid env vars: ${envErrorToString(res.error.issues)}`);
    }

    return res.data;
}
