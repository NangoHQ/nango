import { z } from 'zod';

const ENVS = {
    // Node ecosystem
    NODE_ENV: z.enum(['production', 'development', 'test']).default('development'),
    CI: z.coerce.boolean().default(false),
    VITEST: z.coerce.boolean().default(false),
    TZ: z.string().default('UTC'),

    // Postgres
    NANGO_DATABASE_URL: z.string().url().optional(),
    NANGO_DB_HOST: z.string().optional().default('localhost'),
    NANGO_DB_PORT: z.coerce.number().optional().default(5432),
    NANGO_DB_USER: z.string().optional().default('nango'),
    NANGO_DB_NAME: z.string().optional().default('nango'),
    NANGO_DB_PASSWORD: z.string().optional().default('nango'),
    NANGO_DB_SSL: z.coerce.boolean().default(false),
    NANGO_DB_CLIENT: z.string().optional(),
    NANGO_ENCRYPTION_KEY: z.string().optional(),
    NANGO_DB_MIGRATION_FOLDER: z.string().optional(),

    // Redis
    NANGO_REDIS_URL: z.string().url().optional(),

    // Render
    RENDER_API_KEY: z.string().optional(),
    IS_RENDER: z.coerce.boolean().default(false),

    // Slack
    NANGO_ADMIN_CONNECTION_ID: z.string().optional(),
    NANGO_SLACK_INTEGRATION_KEY: z.string().optional(),
    NANGO_ADMIN_UUID: z.string().uuid().optional(),

    // Sentry
    SENTRY_DNS: z.string().url().optional(),

    // Temporal
    TEMPORAL_NAMESPACE: z.string().optional(),
    TEMPORAL_ADDRESS: z.string().optional(),
    TEMPORAL_WORKER_MAX_CONCURRENCY: z.coerce.number().default(500),

    // ----- Others
    SERVER_RUN_MODE: z.enum(['DOCKERIZED', '']).optional(),
    NANGO_CLOUD: z.coerce.boolean().optional().default(false),
    NANGO_ENTERPRISE: z.coerce.boolean().optional().default(false),
    NANGO_TELEMETRY_SDK: z.coerce.boolean().default(false).optional(),
    NANGO_ADMIN_KEY: z.string().optional(),
    NANGO_INTEGRATIONS_FULL_PATH: z.string().optional(),
    TELEMETRY: z.coerce.boolean().default(true),
    LOG_LEVEL: z.enum(['info', 'debug', 'warn', 'error']).optional().default('info')
};

type EnvKeys = keyof typeof ENVS;

/**
 * Parse and type process.env
 */
export function getEnvs<const TKey extends EnvKeys[]>({ required }: { required: TKey }) {
    const schema = z.object({ ...ENVS }).required(
        required.reduce(
            (prev, curr) => {
                prev[curr as TKey[0]] = true;
                return prev;
            },
            {} as Record<TKey[0], true>
        )
    );

    const res = schema.safeParse(process.env);
    if (!res.success) {
        throw new Error(`Missing or invalid env vars: ${envErrorToString(res.error.issues)}`);
    }

    return res.data;
}

export function envErrorToString(issues: z.ZodIssue[]) {
    return issues
        .map((issue) => {
            return `${issue.path.join('')} (${issue.code} ${issue.message})`;
        })
        .join(', ');
}

const envs = getEnvs({ required: ['NANGO_DATABASE_URL'] });
envs.NANGO_ENCRYPTION_KEY;
envs.NANGO_DATABASE_URL;
